// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableWithoutFeedback,
  Dimensions, Animated, Vibration, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
// Add this right after your imports, before the game constants
import { TouchableOpacity } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── GAME CONSTANTS ───────────────────────────────────────────────────────────
const GROUND_Y     = SH - 130;
const PLAYER_FLOOR = GROUND_Y - 42;
const PLAYER_SIZE  = 42;
const PLAYER_X     = 80;
const JUMP_VEL     = -18;
const GRAVITY      = 0.82;
const INIT_SPEED   = 5;
const MAX_SPEED    = 16;
const SPEED_INC    = 0.0025;
const OB_MIN_H     = 34;
const OB_MAX_H     = 105;
const OB_MIN_W     = 24;
const OB_MAX_W     = 42;
const SPAWN_MIN    = 52;
const SPAWN_MAX    = 115;
const PARTICLE_N   = 20;
const FRAME_MS     = 16;
const SCORE_EVERY  = 60;

// ─── COLORS ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a', player: '#00f5ff', obstacle: '#ff006e',
  ground: '#39ff14', score: '#ffe600', purple: '#bf00ff',
};

const rnd    = (a, b) => Math.random() * (b - a) + a;
const rndInt = (a, b) => Math.floor(rnd(a, b));

// ─────────────────────────────────────────────────────────────────────────────
//  VIBRATION HAPTICS
//  Uses React Native's Vibration — works on every Android & iOS device
//
//  Android: Vibration.vibrate(ms) fires the motor directly
//  iOS:     Vibration.vibrate() gives a single standard pulse
//           (iOS ignores the duration, always does one pulse)
// ─────────────────────────────────────────────────────────────────────────────
const haptic = {
  // Tap to start / retry — strong single buzz
  start: () => {
    try { Vibration.vibrate(80); } catch (_) {}
  },

  // Jump — very short sharp tick
  jump: () => {
    try { Vibration.vibrate(30); } catch (_) {}
  },

  // Land — medium bump
  land: () => {
    try { Vibration.vibrate(45); } catch (_) {}
  },

  // Death — long double-pulse buzz
  die: () => {
    try {
      if (Platform.OS === 'android') {
        // pattern: wait 0ms, buzz 80ms, pause 60ms, buzz 120ms
        Vibration.vibrate([0, 80, 60, 120]);
      } else {
        Vibration.vibrate(200);
      }
    } catch (_) {}
  },

  // Score milestone every 5 pts — two quick taps
  milestone: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 40, 40, 40]);
      } else {
        Vibration.vibrate(60);
      }
    } catch (_) {}
  },
};

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {

  // ── UI state ────────────────────────────────────────────────────────────
  const [screen,    setScreen]    = useState('start');
  const [score,     setScore]     = useState(0);
  const [best,      setBest]      = useState(0);
  const [playerTop, setPlayerTop] = useState(PLAYER_FLOOR);
  const [obs,       setObs]       = useState([]);
  const [parts,     setParts]     = useState([]);
  const [groundOff, setGroundOff] = useState(0);

  // ── Mutable game world (no re-render on write) ───────────────────────────
  const G = useRef({
    alive: false, pY: PLAYER_FLOOR, pVY: 0,
    onGround: true, wasOnGround: true,
    obs: [], parts: [], score: 0, best: 0,
    speed: INIT_SPEED, frame: 0, spawnIn: 80, nextId: 0, groundOff: 0,
  });

  const loopRef = useRef(null);
  const scrRef  = useRef('start');

  // ── Animated values ─────────────────────────────────────────────────────
  const pulseScale = useRef(new Animated.Value(1)).current;
  const titleFade  = useRef(new Animated.Value(0)).current;
  const glitchX    = useRef(new Animated.Value(0)).current;
  const overFade   = useRef(new Animated.Value(0)).current;
  const subOpacity = useRef(new Animated.Value(1)).current;
  const tapOpacity = useRef(new Animated.Value(1)).current;

  // ── Start screen animations ──────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'start') return;

    titleFade.setValue(0);
    Animated.timing(titleFade, { toValue: 1, duration: 900, useNativeDriver: true }).start();

    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseScale, { toValue: 1.28, duration: 560, useNativeDriver: true }),
      Animated.timing(pulseScale, { toValue: 1.0,  duration: 560, useNativeDriver: true }),
    ]));
    pulse.start();

    const flicker = Animated.loop(Animated.sequence([
      Animated.delay(1800),
      Animated.timing(subOpacity, { toValue: 0.2, duration: 60, useNativeDriver: true }),
      Animated.timing(subOpacity, { toValue: 1,   duration: 60, useNativeDriver: true }),
      Animated.timing(subOpacity, { toValue: 0.2, duration: 60, useNativeDriver: true }),
      Animated.timing(subOpacity, { toValue: 1,   duration: 60, useNativeDriver: true }),
    ]));
    flicker.start();

    const tapBlink = Animated.loop(Animated.sequence([
      Animated.timing(tapOpacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
      Animated.timing(tapOpacity, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ]));
    tapBlink.start();

    return () => { pulse.stop(); flicker.stop(); tapBlink.stop(); };
  }, [screen]);

  // ── Game over animations ─────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'over') return;

    overFade.setValue(0);
    Animated.timing(overFade, { toValue: 1, duration: 350, useNativeDriver: true }).start();

    const glitch = Animated.loop(Animated.sequence([
      Animated.timing(glitchX, { toValue:  6, duration: 45, useNativeDriver: true }),
      Animated.timing(glitchX, { toValue: -6, duration: 45, useNativeDriver: true }),
      Animated.timing(glitchX, { toValue:  3, duration: 45, useNativeDriver: true }),
      Animated.timing(glitchX, { toValue:  0, duration: 45, useNativeDriver: true }),
      Animated.delay(1100),
    ]));
    glitch.start();
    return () => glitch.stop();
  }, [screen]);

  // ── Input handler ────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (scrRef.current === 'start' || scrRef.current === 'over') {
      startGame();
    } else {
      if (G.current.onGround) {
        G.current.pVY      = JUMP_VEL;
        G.current.onGround = false;
        haptic.jump();   // 📳 short tick on jump
      }
    }
  }, []);

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = () => {
    const g = G.current;
    Object.assign(g, {
      alive: true, pY: PLAYER_FLOOR, pVY: 0,
      onGround: true, wasOnGround: true,
      obs: [], parts: [], score: 0,
      speed: INIT_SPEED, frame: 0, spawnIn: 80, groundOff: 0,
    });

    setPlayerTop(PLAYER_FLOOR);
    setObs([]); setParts([]); setScore(0); setGroundOff(0);

    haptic.start();   // 📳 strong thud on start

    scrRef.current = 'play';
    setScreen('play');
    clearInterval(loopRef.current);
    loopRef.current = setInterval(tick, FRAME_MS);
  };

  // ── Game tick (~60 fps) ──────────────────────────────────────────────────
  const tick = () => {
    const g = G.current;
    if (!g.alive) return;

    g.frame++;
    g.speed = Math.min(INIT_SPEED + g.frame * SPEED_INC, MAX_SPEED);

    // Physics
    const prevOnGround = g.onGround;
    g.pVY += GRAVITY;
    g.pY  += g.pVY;
    if (g.pY >= PLAYER_FLOOR) {
      g.pY = PLAYER_FLOOR; g.pVY = 0; g.onGround = true;
    }

    // Landing haptic fires exactly once on touchdown
    if (!prevOnGround && g.onGround) {
      haptic.land();   // 📳 medium bump on landing
    }

    g.groundOff = (g.groundOff + g.speed) % 55;

    // Spawn obstacle
    if (--g.spawnIn <= 0) {
      const h = rndInt(OB_MIN_H, OB_MAX_H), w = rndInt(OB_MIN_W, OB_MAX_W);
      g.obs.push({ id: g.nextId++, x: SW + 20, w, h, y: GROUND_Y - h });
      g.spawnIn = rndInt(SPAWN_MIN, SPAWN_MAX);
    }

    // Move & cull
    g.obs = g.obs
      .map(o => ({ ...o, x: o.x - g.speed }))
      .filter(o => o.x + o.w > -20);

    // Particles
    g.parts = g.parts
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.38, life: p.life - 1 }))
      .filter(p => p.life > 0);

    // Collision (5 px inner margin for fair feel)
    const pL = PLAYER_X + 5, pR = PLAYER_X + PLAYER_SIZE - 5;
    const pT = g.pY + 5,     pB = g.pY + PLAYER_SIZE - 5;
    let hit = false;
    for (const o of g.obs) {
      if (pR > o.x && pL < o.x + o.w && pB > o.y && pT < o.y + o.h) { hit = true; break; }
    }

    if (hit) {
      g.alive = false;

      // Death particle burst
      const cx = PLAYER_X + PLAYER_SIZE / 2, cy = g.pY + PLAYER_SIZE / 2;
      g.parts = Array.from({ length: PARTICLE_N }, (_, i) => ({
        id: i, x: cx, y: cy,
        vx: rnd(-8, 8), vy: rnd(-14, -1),
        life: rndInt(28, 55), r: rndInt(3, 9),
        color: [C.player, C.obstacle, C.score, C.purple][rndInt(0, 4)],
      }));

      if (g.score > g.best) g.best = g.score;

      haptic.die();   // 📳 double-pulse death buzz

      clearInterval(loopRef.current);
      setParts([...g.parts]); setScore(g.score); setBest(g.best);
      scrRef.current = 'over'; setScreen('over');
      return;
    }

    // Score
    if (g.frame % SCORE_EVERY === 0) {
      g.score++;
      if (g.score % 5 === 0) haptic.milestone();  // 📳 double-tap every 5 pts
    }

    // Flush to React render
    setPlayerTop(g.pY);
    setObs([...g.obs]);
    setParts([...g.parts]);
    setGroundOff(g.groundOff);
    if (g.frame % SCORE_EVERY === 0) setScore(g.score);
  };

  useEffect(() => () => {
    clearInterval(loopRef.current);
    Vibration.cancel(); // stop any pending vibration on unmount
  }, []);

  // ── Static background layers ─────────────────────────────────────────────
  const ScanLines = useMemo(() =>
    Array.from({ length: Math.floor(SH / 8) }, (_, i) => (
      <View key={i} style={{
        position: 'absolute', left: 0, top: i * 8,
        width: SW, height: 1, backgroundColor: '#fff', opacity: 0.018,
      }} />
    )), []);

  const VGrid = useMemo(() =>
    Array.from({ length: Math.floor(SW / 60) + 1 }, (_, i) => (
      <View key={i} style={{
        position: 'absolute', left: i * 60, top: 0,
        width: 1, height: SH, backgroundColor: '#00f5ff', opacity: 0.025,
      }} />
    )), []);

  // ── Render helpers ───────────────────────────────────────────────────────
  const renderObstacles = () => obs.map(o => (
    <View key={o.id} style={[styles.obstacle, { left: o.x, top: o.y, width: o.w, height: o.h }]} />
  ));

  const renderParticles = () => parts.map(p => (
    <View key={p.id} style={{
      position: 'absolute', left: p.x - p.r / 2, top: p.y - p.r / 2,
      width: p.r, height: p.r, borderRadius: p.r / 2, backgroundColor: p.color,
      shadowColor: p.color, shadowOpacity: 1, shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 }, elevation: 6,
    }} />
  ));

  const renderGround = (offset = 0) => {
    const dashW = 36, step = dashW + 19;
    return Array.from({ length: Math.ceil(SW / step) + 2 }, (_, i) => (
      <View key={i} style={{
        position: 'absolute', left: i * step - offset, top: 0,
        width: dashW, height: 2, backgroundColor: C.ground, opacity: 0.8,
        shadowColor: C.ground, shadowOpacity: 0.9, shadowRadius: 5,
        shadowOffset: { width: 0, height: 0 },
      }} />
    ));
  };


  if (screen === 'start') return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.root}>
        <StatusBar style="light" hidden />
        {ScanLines}{VGrid}

        <Animated.View style={[styles.titleWrap, { opacity: titleFade }]}>
          <Text style={styles.titleMain}>PULSE</Text>
          <Animated.Text style={[styles.titleSub, { opacity: subOpacity }]}>
            ONE SHOT RUNNER
          </Animated.Text>
          <View style={styles.titleDivider} />
          <Text style={styles.titleTagline}>NO RESPAWNS · NO MERCY</Text>
        </Animated.View>

        <View style={[styles.groundRow, { top: GROUND_Y }]}>{renderGround(0)}</View>

        <Animated.View style={[
          styles.player,
          { left: PLAYER_X, top: PLAYER_FLOOR, transform: [{ scale: pulseScale }] },
        ]} />

        <Animated.Text style={[styles.tapPrompt, { opacity: tapOpacity }]}>
          {'[ TAP ANYWHERE TO PLAY ]'}
        </Animated.Text>

        <Text style={styles.deathNote}>☠  ONE LIFE  ☠</Text>
      </View>
    </TouchableWithoutFeedback>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GAME OVER SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (screen === 'over') return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.root}>
        <StatusBar style="light" hidden />
        {ScanLines}{VGrid}

        <View style={[styles.groundRow, { top: GROUND_Y }]}>{renderGround(0)}</View>
        {renderParticles()}

        <Animated.View style={[styles.overPanel, { opacity: overFade }]}>
          <Animated.Text style={[styles.overTxtShadow, { transform: [{ translateX: glitchX }] }]}>
            GAME OVER
          </Animated.Text>
          <Text style={styles.overTxt}>GAME OVER</Text>
          <View style={styles.panelSep} />

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>SCORE</Text>
            <Text style={styles.statVal}>{score}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>BEST</Text>
            <Text style={[styles.statVal, { color: C.purple }]}>{best}</Text>
          </View>

          <View style={styles.panelSep} />
          <Text style={styles.retryTxt}>[ TAP TO RETRY ]</Text>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PLAYING SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.root}>
        <StatusBar style="light" hidden />
        {ScanLines}{VGrid}

        <Text style={styles.liveScore}>{score}</Text>

        <View style={styles.speedBarWrap}>
          <Text style={styles.speedLabel}>SPD</Text>
          <View style={styles.speedBarBg}>
            <View style={[styles.speedBarFill, {
              width: `${Math.min(
                ((G.current.speed - INIT_SPEED) / (MAX_SPEED - INIT_SPEED)) * 100,
                100
              )}%`,
            }]} />
          </View>
        </View>

        <View style={[styles.groundRow, { top: GROUND_Y }]}>{renderGround(groundOff)}</View>
        <View style={[styles.player, { left: PLAYER_X, top: playerTop }]} />
        {renderObstacles()}
        {renderParticles()}
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  groundRow: { position: 'absolute', left: 0, right: 0, height: 3, overflow: 'hidden' },

  player: {
    position: 'absolute', width: PLAYER_SIZE, height: PLAYER_SIZE,
    backgroundColor: C.player, borderRadius: 5,
    shadowColor: C.player, shadowOpacity: 1, shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }, elevation: 14,
  },
  obstacle: {
    position: 'absolute', backgroundColor: C.obstacle, borderRadius: 3,
    shadowColor: C.obstacle, shadowOpacity: 0.95, shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  liveScore: {
    position: 'absolute', top: 52, right: 26, fontSize: 46,
    fontWeight: '900', color: C.score, letterSpacing: 3,
    textShadowColor: C.score, textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  speedBarWrap: { position: 'absolute', top: 60, left: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  speedLabel:   { fontSize: 10, fontWeight: '700', color: '#444', letterSpacing: 2 },
  speedBarBg:   { width: 80, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  speedBarFill: {
    height: 4, backgroundColor: C.obstacle, borderRadius: 2,
    shadowColor: C.obstacle, shadowOpacity: 0.8, shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },

  titleWrap:    { position: 'absolute', top: SH * 0.16, left: 0, right: 0, alignItems: 'center' },
  titleMain:    { fontSize: 90, fontWeight: '900', color: C.player, letterSpacing: 18, textShadowColor: C.player, textShadowRadius: 28, textShadowOffset: { width: 0, height: 0 } },
  titleSub:     { fontSize: 13, fontWeight: '700', color: C.obstacle, letterSpacing: 8, marginTop: 8, textShadowColor: C.obstacle, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  titleDivider: { width: 100, height: 1, marginTop: 22, backgroundColor: C.ground, opacity: 0.5 },
  titleTagline: { marginTop: 14, fontSize: 10, fontWeight: '700', color: '#cc0044', letterSpacing: 4, opacity: 0.7 },
  tapPrompt:    { position: 'absolute', bottom: SH * 0.22, alignSelf: 'center', fontSize: 15, fontWeight: '800', color: C.score, letterSpacing: 4, textShadowColor: C.score, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  deathNote:    { position: 'absolute', bottom: 42, alignSelf: 'center', fontSize: 12, fontWeight: '700', color: '#550022', letterSpacing: 5 },

  overPanel: {
    position: 'absolute', top: SH * 0.17, left: 28, right: 28,
    alignItems: 'center', paddingVertical: 38, paddingHorizontal: 22,
    borderWidth: 1, borderColor: 'rgba(255,0,110,0.55)',
    backgroundColor: 'rgba(8,0,16,0.93)',
    shadowColor: C.obstacle, shadowOpacity: 0.7, shadowRadius: 35,
    shadowOffset: { width: 0, height: 0 }, elevation: 20,
  },
  overTxt:       { fontSize: 50, fontWeight: '900', color: C.obstacle, letterSpacing: 7, textShadowColor: C.obstacle, textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 } },
  overTxtShadow: { position: 'absolute', top: 38, fontSize: 50, fontWeight: '900', color: C.player, letterSpacing: 7, opacity: 0.30, textShadowColor: C.player, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  panelSep:      { width: '80%', height: 1, backgroundColor: '#2a2a2a', marginVertical: 18 },
  statRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 18, marginBottom: 10 },
  statLabel:     { fontSize: 11, fontWeight: '700', color: '#555', letterSpacing: 6 },
  statVal:       { fontSize: 40, fontWeight: '900', color: C.score, letterSpacing: 2, textShadowColor: C.score, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  retryTxt:      { marginTop: 10, fontSize: 13, fontWeight: '800', color: C.player, letterSpacing: 5, textShadowColor: C.player, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
});