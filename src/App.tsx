import { useEffect, useMemo, useRef, useState } from "react";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";

import { OrbitControls, Stars, Sparkles } from "@react-three/drei";

import * as THREE from "three";

import "./App.css";

type FaultType =

  | "Reaction Wheel Saturation"

  | "Orbit Velocity Deviation"

  | "Power Bus Undervoltage"

  | "Thermal Excursion";

type EvidenceStatus = "PASS" | "WARN" | "BLOCKED" | "ACTIVE";

type Evidence = {

  id: number;

  time: string;

  type: string;

  detail: string;

  status: EvidenceStatus;

};

type Candidate = {

  name: string;

  short: string;

  color: string;

  metrics: {

    recoveryTime: number;

    resourceUse: number;

    risk: number;

    missionImpact: number;

    constraint: number;

  };

  score: number;

  calculations: string[];

  explanation: string;

};

const FAULTS: Record<

  FaultType,

  {

    icon: string;

    severity: string;

    color: string;

    description: string;

  }

> = {

  "Reaction Wheel Saturation": {

    icon: "◉",

    severity: "HIGH",

    color: "#f59e0b",

    description:

      "Reaction wheel momentum exceeds the allowable operating limit.",

  },

  "Orbit Velocity Deviation": {

    icon: "⌁",

    severity: "HIGH",

    color: "#ef4444",

    description:

      "Measured orbital velocity has deviated from the expected trajectory.",

  },

  "Power Bus Undervoltage": {

    icon: "ϟ",

    severity: "CRITICAL",

    color: "#ef4444",

    description:

      "Spacecraft power bus voltage has fallen below its safe operating threshold.",

  },

  "Thermal Excursion": {

    icon: "◈",

    severity: "MEDIUM",

    color: "#f59e0b",

    description:

      "Spacecraft temperature has exceeded the preferred thermal envelope.",

  },

};

function now() {

  return new Date().toLocaleTimeString([], {

    hour: "2-digit",

    minute: "2-digit",

    second: "2-digit",

  });

}

/* -------------------------------------------------------

   TELEMETRY

------------------------------------------------------- */

function getTelemetry(theta: number) {

  const latitude = 18.45 + Math.sin(theta) * 4.8;

  const longitude = 73.9 + Math.cos(theta) * 8.6;

  const altitude = 543.2 + Math.sin(theta * 2) * 4.7;

  const velocity = 7.48 + Math.cos(theta * 1.7) * 0.018;

  const wheelRPM = 4820 + Math.sin(theta * 1.8) * 65;

  return {

    latitude,

    longitude,

    altitude,

    velocity,

    wheelRPM,

  };

}

/* -------------------------------------------------------

   SCORING

------------------------------------------------------- */

function scoreCandidates(candidates: Candidate[]) {

  const maxTime = Math.max(

    ...candidates.map((c) => c.metrics.recoveryTime)

  );

  const maxResource = Math.max(

    ...candidates.map((c) => c.metrics.resourceUse)

  );

  return candidates.map((candidate) => {

    const timeScore =

      maxTime === 0

        ? 100

        : 100 * (1 - candidate.metrics.recoveryTime / maxTime);

    const resourceScore =

      maxResource === 0

        ? 100

        : 100 * (1 - candidate.metrics.resourceUse / maxResource);

    const riskScore = 100 - candidate.metrics.risk;

    const impactScore = 100 - candidate.metrics.missionImpact;

    const constraintScore = candidate.metrics.constraint;

    const score =

      timeScore * 0.2 +

      resourceScore * 0.2 +

      riskScore * 0.25 +

      impactScore * 0.15 +

      constraintScore * 0.2;

    return {

      ...candidate,

      score: Number(score.toFixed(1)),

    };

  });

}

/* -------------------------------------------------------

   RECOVERY ENGINE

------------------------------------------------------- */

function getCandidates(fault: FaultType): Candidate[] {

  if (fault === "Reaction Wheel Saturation") {

    const I = 0.00185;

    const rpmInitial = 6200;

    const rpmTarget = 4800;

    const omegaInitial = (rpmInitial * 2 * Math.PI) / 60;

    const omegaTarget = (rpmTarget * 2 * Math.PI) / 60;

    const HInitial = I * omegaInitial;

    const HTarget = I * omegaTarget;

    const deltaH = HInitial - HTarget;

    /* Magnetic desaturation */

    const magneticTorque = 85e-6;

    const magneticTime = deltaH / magneticTorque;

    const magnetic: Candidate = {

      name: "Magnetic Desaturation",

      short: "MAGNETIC DESAT",

      color: "#22d3ee",

      metrics: {

        recoveryTime: magneticTime,

        resourceUse: 0,

        risk: 12,

        missionImpact: 10,

        constraint: 95,

      },

      score: 0,

      calculations: [

        `Wheel inertia I = ${I.toFixed(5)} kg·m²`,

        `Initial speed = ${rpmInitial} RPM`,

        `Target speed = ${rpmTarget} RPM`,

        `ω₁ = RPM × 2π / 60 = ${omegaInitial.toFixed(2)} rad/s`,

        `ω₂ = RPM × 2π / 60 = ${omegaTarget.toFixed(2)} rad/s`,

        `H₁ = Iω₁ = ${HInitial.toFixed(3)} N·m·s`,

        `H₂ = Iω₂ = ${HTarget.toFixed(3)} N·m·s`,

        `ΔH = H₁ − H₂ = ${deltaH.toFixed(3)} N·m·s`,

        `Magnetic torque τ = 85 μN·m`,

        `t = ΔH / τ = ${magneticTime.toFixed(1)} s`,

      ],

      explanation:

        "Uses magnetic torque to unload reaction-wheel momentum without consuming propellant.",

    };

    /* Thruster momentum dump */

    const thrustForce = 0.055;

    const leverArm = 0.25;

    const thrusterTorque = thrustForce * leverArm;

    const thrusterTime = deltaH / thrusterTorque;

    const isp = 220;

    const g0 = 9.80665;

    const propellant =

      (thrustForce * thrusterTime) / (isp * g0);

    const thruster: Candidate = {

      name: "Thruster Momentum Dump",

      short: "THRUSTER DUMP",

      color: "#8b5cf6",

      metrics: {

        recoveryTime: thrusterTime,

        resourceUse: propellant,

        risk: 31,

        missionImpact: 25,

        constraint: 82,

      },

      score: 0,

      calculations: [

        `Required momentum reduction ΔH = ${deltaH.toFixed(

          3

        )} N·m·s`,

        `Thrust force F = ${thrustForce.toFixed(3)} N`,

        `Lever arm r = ${leverArm.toFixed(2)} m`,

        `τ = rF = ${thrusterTorque.toFixed(5)} N·m`,

        `t = ΔH / τ = ${thrusterTime.toFixed(1)} s`,

        `Isp = ${isp} s`,

        `ṁ = F / (Isp × g₀)`,

        `Propellant = ${propellant.toFixed(4)} kg`,

      ],

      explanation:

        "Uses thruster torque to remove stored momentum, but consumes propellant and introduces greater actuator and mission impact.",

    };

    return scoreCandidates([magnetic, thruster]);

  }

  if (fault === "Orbit Velocity Deviation") {

    const deltaV = 0.042;

    /*

      Renamed this variable so it does not conflict with

      the Candidate object named lowThrust below.

    */

    const lowThrustAccel = 0.018;

    const shortImpulse = 0.12;

    const lowThrustTime = deltaV / lowThrustAccel;

    const impulseTime = deltaV / shortImpulse;

    const lowThrust: Candidate = {

      name: "Low-Thrust Correction",

      short: "LOW-THRUST",

      color: "#22d3ee",

      metrics: {

        recoveryTime: lowThrustTime,

        resourceUse: 18,

        risk: 11,

        missionImpact: 8,

        constraint: 94,

      },

      score: 0,

      calculations: [

        `Velocity error ΔV = ${deltaV.toFixed(3)} km/s`,

        `Available low-thrust acceleration = ${lowThrustAccel.toFixed(

          3

        )} m/s²`,

        `Correction duration = ΔV / a`,

        `Duration = ${lowThrustTime.toFixed(2)} s`,

        `Expected correction = ${deltaV.toFixed(3)} km/s`,

        `Trajectory deviation after correction → nominal band`,

      ],

      explanation:

        "Applies a controlled correction gradually, reducing abrupt trajectory changes and limiting mission disturbance.",

    };

    const impulse: Candidate = {

      name: "Short Impulse Correction",

      short: "SHORT IMPULSE",

      color: "#8b5cf6",

      metrics: {

        recoveryTime: impulseTime,

        resourceUse: 30,

        risk: 28,

        missionImpact: 22,

        constraint: 83,

      },

      score: 0,

      calculations: [

        `Velocity error ΔV = ${deltaV.toFixed(3)} km/s`,

        `Impulse acceleration = ${shortImpulse.toFixed(3)} m/s²`,

        `Burn duration = ΔV / a`,

        `Burn duration = ${impulseTime.toFixed(2)} s`,

        `Required correction = ${deltaV.toFixed(3)} km/s`,

        `Post-burn trajectory checked against tolerance`,

      ],

      explanation:

        "Corrects the velocity error rapidly, but the larger instantaneous actuation produces more trajectory and actuator disturbance.",

    };

    return scoreCandidates([lowThrust, impulse]);

  }

  if (fault === "Power Bus Undervoltage") {

    const load = 1.8;

    const available = 1.35;

    const deficit = load - available;

    const shedding: Candidate = {

      name: "Load Shedding",

      short: "LOAD SHEDDING",

      color: "#22d3ee",

      metrics: {

        recoveryTime: 4.2,

        resourceUse: deficit,

        risk: 10,

        missionImpact: 16,

        constraint: 96,

      },

      score: 0,

      calculations: [

        `Required load = ${load.toFixed(2)} kW`,

        `Available power = ${available.toFixed(2)} kW`,

        `Power deficit = ${deficit.toFixed(2)} kW`,

        `Non-essential load removed = ${deficit.toFixed(2)} kW`,

        `New load = ${available.toFixed(2)} kW`,

        `Voltage margin restored above protection threshold`,

      ],

      explanation:

        "Immediately reduces non-essential consumption, directly closing the power deficit without stressing the battery.",

    };

    const battery: Candidate = {

      name: "Battery Support",

      short: "BATTERY SUPPORT",

      color: "#8b5cf6",

      metrics: {

        recoveryTime: 2.8,

        resourceUse: 0.22,

        risk: 25,

        missionImpact: 13,

        constraint: 86,

      },

      score: 0,

      calculations: [

        `Required load = ${load.toFixed(2)} kW`,

        `Available power = ${available.toFixed(2)} kW`,

        `Power deficit = ${deficit.toFixed(2)} kW`,

        `Battery contribution = ${deficit.toFixed(2)} kW`,

        `Estimated energy draw = 0.22 kWh`,

        `Bus voltage restored`,

      ],

      explanation:

        "Restores the bus quickly, but uses stored battery energy that may be required later in the mission.",

    };

    return scoreCandidates([shedding, battery]);

  }

  /* THERMAL EXCURSION */

  const thermalLoad = 74;

  const thermalLimit = 68;

  const excess = thermalLoad - thermalLimit;

  const loadReduction: Candidate = {

    name: "Thermal Load Reduction",

    short: "LOAD REDUCTION",

    color: "#22d3ee",

    metrics: {

      recoveryTime: 38,

      resourceUse: 8,

      risk: 9,

      missionImpact: 13,

      constraint: 95,

    },

    score: 0,

    calculations: [

      `Measured temperature = ${thermalLoad.toFixed(1)} °C`,

      `Thermal limit = ${thermalLimit.toFixed(1)} °C`,

      `Excess = ${excess.toFixed(1)} °C`,

      `Non-essential thermal load reduced`,

      `Estimated cooling rate = 0.16 °C/s`,

      `Expected recovery = ${(excess / 0.16).toFixed(1)} s`,

    ],

    explanation:

      "Reduces internal heat generation while keeping spacecraft attitude unchanged.",

  };

  const attitude: Candidate = {

    name: "Attitude Reorientation",

    short: "ATTITUDE SHIFT",

    color: "#8b5cf6",

    metrics: {

      recoveryTime: 27,

      resourceUse: 18,

      risk: 24,

      missionImpact: 20,

      constraint: 84,

    },

    score: 0,

    calculations: [

      `Measured temperature = ${thermalLoad.toFixed(1)} °C`,

      `Thermal limit = ${thermalLimit.toFixed(1)} °C`,

      `Excess = ${excess.toFixed(1)} °C`,

      `Spacecraft attitude changed`,

      `Estimated cooling rate = 0.22 °C/s`,

      `Expected recovery = ${(excess / 0.22).toFixed(1)} s`,

    ],

    explanation:

      "Improves thermal rejection faster, but changes spacecraft attitude and therefore has a larger mission impact.",

  };

  return scoreCandidates([loadReduction, attitude]);

}

/* -------------------------------------------------------

   EARTH + ROCKET

------------------------------------------------------- */

function Rocket({

  theta,

  faultActive,

}: {

  theta: number;

  faultActive: boolean;

}) {

  const rocketRef = useRef<THREE.Group>(null);

  useFrame(() => {

    if (!rocketRef.current) return;

    const x = Math.cos(theta) * 3.35;

    const z = Math.sin(theta) * 2.5;

    const y = 0.18 * Math.sin(theta * 2);

    rocketRef.current.position.set(x, y, z);

    const nextTheta = theta + 0.015;

    const nx = Math.cos(nextTheta) * 3.35;

    const nz = Math.sin(nextTheta) * 2.5;

    const ny = 0.18 * Math.sin(nextTheta * 2);

    rocketRef.current.lookAt(nx, ny, nz);

    rocketRef.current.rotateX(Math.PI / 2);

  });

  return (

    <group ref={rocketRef} scale={0.42}>

      {/* MAIN BODY */}

      <mesh castShadow>

        <cylinderGeometry args={[0.55, 0.65, 2.15, 24]} />

        <meshStandardMaterial

          color={faultActive ? "#ff5b5b" : "#dbeafe"}

          metalness={0.7}

          roughness={0.27}

        />

      </mesh>

      {/* NOSE */}

      <mesh position={[0, 1.42, 0]} castShadow>

        <coneGeometry args={[0.55, 0.8, 24]} />

        <meshStandardMaterial

          color="#f8fafc"

          metalness={0.65}

          roughness={0.22}

        />

      </mesh>

      {/* DARK SERVICE SECTION */}

      <mesh position={[0, 0.35, 0]}>

        <cylinderGeometry args={[0.58, 0.58, 0.38, 24]} />

        <meshStandardMaterial

          color="#172033"

          metalness={0.9}

          roughness={0.2}

        />

      </mesh>

      {/* ENGINE */}

      <mesh position={[0, -1.35, 0]}>

        <cylinderGeometry args={[0.3, 0.18, 0.45, 20]} />

        <meshStandardMaterial

          color="#111827"

          metalness={0.8}

          roughness={0.2}

        />

      </mesh>

      {/* ENGINE LIGHT */}

      <pointLight

        position={[0, -1.65, 0]}

        intensity={faultActive ? 0.2 : 2}

        distance={2.5}

        color={faultActive ? "#ff453a" : "#38bdf8"}

      />

      {/* SOLAR PANELS */}

      <mesh position={[1.2, 0.05, 0]}>

        <boxGeometry args={[1.35, 0.08, 0.72]} />

        <meshStandardMaterial

          color="#173a63"

          metalness={0.65}

          roughness={0.28}

        />

      </mesh>

      <mesh position={[-1.2, 0.05, 0]}>

        <boxGeometry args={[1.35, 0.08, 0.72]} />

        <meshStandardMaterial

          color="#173a63"

          metalness={0.65}

          roughness={0.28}

        />

      </mesh>

      {/* PANEL HIGHLIGHTS */}

      <mesh position={[1.2, 0.1, 0]}>

        <boxGeometry args={[1.05, 0.015, 0.55]} />

        <meshStandardMaterial

          color="#2563eb"

          emissive="#0f4c81"

          emissiveIntensity={0.4}

        />

      </mesh>

      <mesh position={[-1.2, 0.1, 0]}>

        <boxGeometry args={[1.05, 0.015, 0.55]} />

        <meshStandardMaterial

          color="#2563eb"

          emissive="#0f4c81"

          emissiveIntensity={0.4}

        />

      </mesh>

      {/* ANTENNA */}

      <mesh position={[0, 1.85, 0]}>

        <cylinderGeometry args={[0.035, 0.035, 0.65, 8]} />

        <meshStandardMaterial color="#94a3b8" />

      </mesh>

      <mesh position={[0, 2.2, 0]}>

        <sphereGeometry args={[0.07, 12, 12]} />

        <meshStandardMaterial

          color="#38bdf8"

          emissive="#38bdf8"

          emissiveIntensity={2}

        />

      </mesh>

      {faultActive && (

        <Sparkles

          count={30}

          scale={2.2}

          size={3}

          speed={2}

          color="#ff4545"

        />

      )}

    </group>

  );

}

function EarthScene({

  theta,

  faultActive,

}: {

  theta: number;

  faultActive: boolean;

}) {

  const earthTexture = useLoader(

    THREE.TextureLoader,

    "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"

  );

  return (

    <>

      <ambientLight intensity={0.42} />

      <directionalLight

        position={[5, 5, 4]}

        intensity={2.4}

      />

      <Stars

        radius={80}

        depth={45}

        count={3500}

        factor={2}

        saturation={0}

        fade

        speed={0.3}

      />

      <Sparkles

        count={100}

        scale={12}

        size={1.3}

        speed={0.15}

        color="#7dd3fc"

      />

      {/* ORBIT PATH */}

      <mesh rotation={[Math.PI / 2, 0, 0]}>

        <torusGeometry args={[2.94, 0.008, 8, 160]} />

        <meshBasicMaterial

          color="#38bdf8"

          transparent

          opacity={0.3}

        />

      </mesh>

      {/* EARTH */}

      <mesh>

        <sphereGeometry args={[1.48, 96, 96]} />

        <meshStandardMaterial

          map={earthTexture}

          roughness={0.92}

          metalness={0.02}

        />

      </mesh>

      {/* ATMOSPHERE */}

      <mesh scale={1.035}>

        <sphereGeometry args={[1.48, 64, 64]} />

        <meshBasicMaterial

          color="#3b82f6"

          transparent

          opacity={0.12}

          side={THREE.BackSide}

        />

      </mesh>

      <mesh scale={1.07}>

        <sphereGeometry args={[1.48, 64, 64]} />

        <meshBasicMaterial

          color={faultActive ? "#ff453a" : "#38bdf8"}

          transparent

          opacity={0.055}

          side={THREE.BackSide}

        />

      </mesh>

      <Rocket

        theta={theta}

        faultActive={faultActive}

      />

    </>

  );

}

/* -------------------------------------------------------

   APP

------------------------------------------------------- */

export default function App() {

  const [theta, setTheta] = useState(0);

  const [showLanding, setShowLanding] =

    useState(true);

  const [fault, setFault] =

    useState<FaultType | null>(null);

  const [recovered, setRecovered] =

    useState(false);

  const [plannerOpen, setPlannerOpen] =

    useState(false);

  const [plannerTab, setPlannerTab] =

    useState<"CALCULATION" | "GRAPH" | "RESULT">(

      "CALCULATION"

    );

  const [calculationMethod, setCalculationMethod] =

    useState(0);

  const [calculationStep, setCalculationStep] =

    useState(0);

  const [calculationFinished, setCalculationFinished] =

    useState(false);

  const [evidenceOpen, setEvidenceOpen] =

    useState(false);

  const [proofGateOpen, setProofGateOpen] =

    useState(false);

  const [evidence, setEvidence] =

    useState<Evidence[]>([]);

  const [telemetry, setTelemetry] =

    useState(getTelemetry(0));

  const [selectedMethod, setSelectedMethod] =

    useState<Candidate | null>(null);

  const candidates = useMemo(

    () => (fault ? getCandidates(fault) : []),

    [fault]

  );

  const activeFault = fault

    ? FAULTS[fault]

    : null;

  /* -------------------------------------------------------

     ORBIT ANIMATION

  ------------------------------------------------------- */

  useEffect(() => {

    if (showLanding) return;

    const timer = setInterval(() => {

      if (!fault) {

        setTheta((prev) => prev + 0.012);

      }

    }, 40);

    return () => clearInterval(timer);

  }, [showLanding, fault]);

  useEffect(() => {

    setTelemetry(getTelemetry(theta));

  }, [theta]);

  /* -------------------------------------------------------

     EVIDENCE

  ------------------------------------------------------- */

  function addEvidence(

    type: string,

    detail: string,

    status: EvidenceStatus

  ) {

    setEvidence((prev) => [

      ...prev,

      {

        id: Date.now() + Math.random(),

        time: now(),

        type,

        detail,

        status,

      },

    ]);

  }

  /* -------------------------------------------------------

     INJECT FAULT

  ------------------------------------------------------- */

  function injectFault(type: FaultType) {

    setFault(type);

    setRecovered(false);

    setSelectedMethod(null);

    setPlannerTab("CALCULATION");

    setCalculationMethod(0);

    setCalculationStep(0);

    setCalculationFinished(false);

    addEvidence(

      "ANOMALY DETECTED",

      `${type} detected in spacecraft telemetry.`,

      "BLOCKED"

    );

    addEvidence(

      "COMMAND GATE",

      "Autonomous recovery blocked pending evidence-backed procedure.",

      "BLOCKED"

    );

  }

  /* -------------------------------------------------------

     OPEN PLANNER

  ------------------------------------------------------- */

  function openPlanner() {

    if (!fault) return;

    setPlannerOpen(true);

    setPlannerTab("CALCULATION");

    setCalculationMethod(0);

    setCalculationStep(0);

    setCalculationFinished(false);

    addEvidence(

      "RECOVERY PLANNER",

      "Candidate recovery procedures generated for evaluation.",

      "ACTIVE"

    );

  }

  /* -------------------------------------------------------

     LIVE CALCULATION

  ------------------------------------------------------- */

  useEffect(() => {

    if (!plannerOpen || !fault) return;

    if (calculationFinished) return;

    const current =

      candidates[calculationMethod];

    if (!current) return;

    if (

      calculationStep <

      current.calculations.length

    ) {

      const timer = setTimeout(() => {

        setCalculationStep(

          (prev) => prev + 1

        );

      }, 650);

      return () => clearTimeout(timer);

    }

    if (

      calculationStep >=

        current.calculations.length &&

      calculationMethod <

        candidates.length - 1

    ) {

      const timer = setTimeout(() => {

        addEvidence(

          "METHOD SIMULATED",

          `${current.name} simulation completed with suitability score ${current.score}/100.`,

          "PASS"

        );

        setCalculationMethod(

          (prev) => prev + 1

        );

        setCalculationStep(0);

      }, 800);

      return () => clearTimeout(timer);

    }

    if (

      calculationStep >=

        current.calculations.length &&

      calculationMethod ===

        candidates.length - 1

    ) {

      const timer = setTimeout(() => {

        addEvidence(

          "METHOD SIMULATED",

          `${current.name} simulation completed with suitability score ${current.score}/100.`,

          "PASS"

        );

        setCalculationFinished(true);

        const best = candidates.reduce(

          (a, b) =>

            a.score > b.score ? a : b

        );

        setSelectedMethod(best);

        addEvidence(

          "CONSTRAINT CHECK",

          `Both procedures passed feasibility checks. Decision model selected ${best.name} at ${best.score}/100 suitability.`,

          "PASS"

        );

      }, 800);

      return () => clearTimeout(timer);

    }

  }, [

    plannerOpen,

    fault,

    candidates,

    calculationMethod,

    calculationStep,

    calculationFinished,

  ]);

  /* -------------------------------------------------------

     APPLY RECOVERY

  ------------------------------------------------------- */

  function openProofGate() {

    if (!selectedMethod || !fault || !calculationFinished) return;


    const checks = [

      fault !== null,

      calculationFinished && candidates.length >= 2,

      candidates.every((candidate) =>

        Number.isFinite(candidate.score) &&

        Number.isFinite(candidate.metrics.recoveryTime) &&

        Number.isFinite(candidate.metrics.risk) &&

        Number.isFinite(candidate.metrics.constraint)

      ),

      selectedMethod.metrics.constraint >= 80,

      Number.isFinite(selectedMethod.score),

    ];


    if (checks.every(Boolean)) {

      addEvidence(

        "PROOF GATE CHECK",

        "Anomaly, simulations, numerical validity and recovery constraints passed machine-checkable evidence checks.",

        "PASS"

      );

      setProofGateOpen(true);

    } else {

      addEvidence(

        "PROOF GATE BLOCKED",

        "Recovery cannot be authorized because one or more evidence checks failed.",

        "BLOCKED"

      );

    }

  }


  function authorizeRecovery() {

    setProofGateOpen(false);

    applyRecovery();

  }


  function applyRecovery() {

    if (!selectedMethod || !fault) return;

    addEvidence(

      "RECOVERY AUTHORIZED",

      `${selectedMethod.name} selected after candidate comparison.`,

      "PASS"

    );

    addEvidence(

      "RECOVERY EXECUTED",

      `${selectedMethod.name} command sequence simulated and applied.`,

      "ACTIVE"

    );

    setRecovered(true);

    setPlannerOpen(false);

    setTimeout(() => {

      addEvidence(

        "TELEMETRY VERIFIED",

        `${fault} telemetry returned inside the configured recovery envelope.`,

        "PASS"

      );

      addEvidence(

        "MISSION RESUMED",

        "Spacecraft returned to nominal autonomous operation.",

        "PASS"

      );

    }, 1300);

  }

  /* -------------------------------------------------------

     CONTINUE MISSION

  ------------------------------------------------------- */

  function continueMission() {

    setFault(null);

    setRecovered(false);

    setPlannerOpen(false);

    setSelectedMethod(null);

  }

  /* -------------------------------------------------------

     RESET

  ------------------------------------------------------- */

  function resetMission() {

    setFault(null);

    setRecovered(false);

    setPlannerOpen(false);

    setSelectedMethod(null);

    setEvidence([]);

    setShowLanding(true);

    setTheta(0);

  }

  /* -------------------------------------------------------

     LANDING PAGE

  ------------------------------------------------------- */

  if (showLanding) {

    return (

      <div className="landing">

        <div className="landing-stars" />

        <div className="landing-earth">

          <div className="landing-glow" />

          <div className="landing-earth-core" />

        </div>

        <div className="landing-content">

          <div className="landing-kicker">

            ORBITGUARD // AUTONOMOUS FLIGHT CONTROL

          </div>

          <h1>

            Evidence-Gated

            <br />

            <span>Self-Healing</span>

          </h1>

          <p>

            Autonomous anomaly detection,

            recovery planning, evidence validation

            and mission resumption.

          </p>

          <button

            className="mission-button"

            onClick={() => setShowLanding(false)}

          >

            <span>START MISSION</span>

            <b>→</b>

          </button>

        </div>

        <div className="landing-bottom">

          <span>ZERO-TRUST RECOVERY</span>

          <span>•</span>

          <span>PHYSICS VALIDATED</span>

          <span>•</span>

          <span>AUTONOMOUS CONTROL</span>

        </div>

      </div>

    );

  }

  return (

    <div className="app">

      {/* TOP BAR */}

      <header className="topbar">

        <div>

          <div className="brand">

            ORBITGUARD-AI

          </div>

          <div className="brand-sub">

            ZERO-TRUST AUTONOMOUS SATELLITE

            CONTROL

          </div>

        </div>

        <div className="top-status">

          <span

            className={

              fault

                ? "status-dot danger"

                : "status-dot"

            }

          />

          <span>

            {fault

              ? "ANOMALY CONTAINED"

              : "SYSTEM NOMINAL"}

          </span>

          <button

            className="vault-button"

            onClick={() =>

              setEvidenceOpen(true)

            }

          >

            EVIDENCE VAULT

            <b>{evidence.length}</b>

          </button>

          <button

            className="reset-button"

            onClick={resetMission}

          >

            RESET MISSION

          </button>

        </div>

      </header>

      {/* MAIN */}

      <main className="dashboard">

        {/* LEFT PANEL */}

        <aside className="left-panel">

          <div className="panel-title">

            LIVE TELEMETRY

          </div>

          <div className="telemetry-card">

            <span>LATITUDE</span>

            <strong>

              {telemetry.latitude.toFixed(4)}°

            </strong>

          </div>

          <div className="telemetry-card">

            <span>LONGITUDE</span>

            <strong>

              {telemetry.longitude.toFixed(4)}°

            </strong>

          </div>

          <div className="telemetry-card">

            <span>ALTITUDE</span>

            <strong>

              {telemetry.altitude.toFixed(2)} km

            </strong>

          </div>

          <div className="telemetry-card">

            <span>VELOCITY</span>

            <strong>

              {telemetry.velocity.toFixed(3)} km/s

            </strong>

          </div>

          <div className="telemetry-card">

            <span>RW-Z SPEED</span>

            <strong>

              {telemetry.wheelRPM.toFixed(0)} RPM

            </strong>

          </div>

          <div className="simulation-note">

            SIMULATED / HIL TELEMETRY

          </div>

          <div className="mission-phase">

            <span>MISSION PHASE</span>

            <b>

              {fault

                ? recovered

                  ? "RECOVERY VERIFIED"

                  : "ANOMALY CONTAINMENT"

                : "NOMINAL ORBIT"}

            </b>

          </div>

        </aside>

        {/* CENTER */}

        <section className="space-view">

          <div className="space-label">

            <span>ORBITAL VIEW</span>

            <span>LEO // 543 KM</span>

          </div>

          <Canvas

            camera={{

              position: [0, 3.9, 9.8],

              fov: 43,

            }}

            dpr={[1, 2]}

          >

            <EarthScene

              theta={theta}

              faultActive={Boolean(

                fault && !recovered

              )}

            />

            <OrbitControls

              enablePan={false}

              enableZoom={false}

              autoRotate={false}

            />

          </Canvas>

          <div className="orbit-readout">

            <span>ORBIT TRACK</span>

            <strong>

              {fault

                ? recovered

                  ? "NOMINAL"

                  : "CONTAINED"

                : "STABLE"}

            </strong>

          </div>

          {fault && !recovered && (

            <div className="anomaly-beacon">

              <div className="beacon-pulse" />

              <div>

                <small>ANOMALY</small>

                <strong>{fault}</strong>

              </div>

            </div>

          )}

          {recovered && (

            <div className="recovery-beacon">

              <span>✓</span>

              <div>

                <small>

                  RECOVERY VERIFIED

                </small>

                <strong>

                  MISSION RESUMED

                </strong>

              </div>

            </div>

          )}

        </section>

        {/* RIGHT PANEL */}

        <aside className="right-panel">

          <div className="panel-title">

            ANOMALY CONTROL

          </div>

          {!fault && (

            <>

              <div className="control-description">

                Inject a controlled spacecraft

                anomaly to test the evidence-gated

                recovery workflow.

              </div>

              <div className="fault-list">

                {(

                  Object.keys(

                    FAULTS

                  ) as FaultType[]

                ).map((type) => {

                  const info = FAULTS[type];

                  return (

                    <button

                      className="fault-button"

                      key={type}

                      onClick={() =>

                        injectFault(type)

                      }

                    >

                      <span

                        className="fault-icon"

                        style={{

                          color: info.color,

                        }}

                      >

                        {info.icon}

                      </span>

                      <span className="fault-info">

                        <b>{type}</b>

                        <small>

                          {info.severity} SEVERITY

                        </small>

                      </span>

                      <span className="arrow">

                        →

                      </span>

                    </button>

                  );

                })}

              </div>

            </>

          )}

          {fault && activeFault && (

            <div className="active-anomaly">

              <div

                className="active-anomaly-header"

                style={{

                  borderColor:

                    activeFault.color,

                }}

              >

                <div>

                  <small>

                    ACTIVE ANOMALY

                  </small>

                  <h2>{fault}</h2>

                </div>

                <span

                  className="severity-pill"

                  style={{

                    color:

                      activeFault.color,

                  }}

                >

                  {activeFault.severity}

                </span>

              </div>

              <p>

                {activeFault.description}

              </p>

              {!recovered ? (

                <>

                  <div className="gate-box">

                    <div className="gate-icon">

                      !

                    </div>

                    <div>

                      <b>

                        COMMAND BLOCKED

                      </b>

                      <span>

                        Recovery requires evidence

                        validation.

                      </span>

                    </div>

                  </div>

                  <button

                    className="planner-button"

                    onClick={openPlanner}

                  >

                    OPEN RECOVERY PLANNER

                    <span>→</span>

                  </button>

                </>

              ) : (

                <>

                  <div className="verified-box">

                    <div>✓</div>

                    <span>

                      <b>

                        RECOVERY VERIFIED

                      </b>

                      <small>

                        Telemetry is back inside

                        the safe envelope.

                      </small>

                    </span>

                  </div>

                  <button

                    className="continue-button"

                    onClick={continueMission}

                  >

                    CONTINUE MISSION →

                  </button>

                </>

              )}

            </div>

          )}

        </aside>

      </main>

      {/* -------------------------------------------------

          RECOVERY PLANNER

      ------------------------------------------------- */}

      {plannerOpen && fault && (

        <div className="modal-backdrop">

          <div className="planner-modal">

            <div className="planner-header">

              <div>

                <span>

                  RECOVERY PLANNER //

                  PHYSICS ENGINE

                </span>

                <h2>{fault}</h2>

              </div>

              <button

                onClick={() =>

                  setPlannerOpen(false)

                }

              >

                ×

              </button>

            </div>

            {/* TABS */}

            <div className="planner-tabs">

              <button

                className={

                  plannerTab === "CALCULATION"

                    ? "active cyan-tab"

                    : "cyan-tab"

                }

                onClick={() =>

                  setPlannerTab("CALCULATION")

                }

              >

                01 · LIVE CALCULATION

              </button>

              <button

                disabled={!calculationFinished}

                className={

                  plannerTab === "GRAPH"

                    ? "active purple-tab"

                    : "purple-tab"

                }

                onClick={() =>

                  setPlannerTab("GRAPH")

                }

              >

                02 · METHOD GRAPH

              </button>

              <button

                disabled={!calculationFinished}

                className={

                  plannerTab === "RESULT"

                    ? "active green-tab"

                    : "green-tab"

                }

                onClick={() =>

                  setPlannerTab("RESULT")

                }

              >

                03 · VIEW RESULT

              </button>

            </div>

            {/* CALCULATION */}

            {plannerTab === "CALCULATION" && (

              <div className="calculation-view">

                <div className="calculation-progress">

                  <div

                    className="progress-fill"

                    style={{

                      width: calculationFinished

                        ? "100%"

                        : `${

                            ((calculationMethod +

                              calculationStep /

                                Math.max(

                                  candidates[

                                    calculationMethod

                                  ]?.calculations

                                    .length || 1,

                                  1

                                )) /

                              candidates.length) *

                            100

                          }%`,

                    }}

                  />

                </div>

                <div className="method-running">

                  METHOD{" "}

                  {calculationMethod + 1} OF{" "}

                  {candidates.length}

                </div>

                <div className="candidate-grid">

                  {candidates.map(

                    (candidate, index) => (

                      <div

                        className={`candidate-card ${

                          index ===

                          calculationMethod

                            ? "running"

                            : index <

                                  calculationMethod ||

                                calculationFinished

                              ? "complete"

                              : ""

                        }`}

                        key={candidate.name}

                      >

                        <div

                          className="candidate-accent"

                          style={{

                            background:

                              candidate.color,

                          }}

                        />

                        <div>

                          <small>

                            METHOD {index + 1}

                          </small>

                          <h3>

                            {candidate.name}

                          </h3>

                        </div>

                        <span>

                          {index <

                              calculationMethod ||

                          calculationFinished

                            ? "✓"

                            : index ===

                                calculationMethod

                              ? "CALCULATING"

                              : "QUEUED"}

                        </span>

                      </div>

                    )

                  )}

                </div>

                {!calculationFinished && (

                  <div className="live-calculation-box">

                    <div className="live-header">

                      <span className="live-dot" />

                      LIVE PHYSICS CALCULATION

                    </div>

                    <h3>

                      {

                        candidates[

                          calculationMethod

                        ]?.name

                      }

                    </h3>

                    <div className="equation-list">

                      {candidates[

                        calculationMethod

                      ]?.calculations.map(

                        (line, index) => (

                          <div

                            className={

                              index <

                              calculationStep

                                ? "equation visible"

                                : "equation"

                            }

                            key={line}

                          >

                            <span>

                              {index <

                              calculationStep

                                ? "✓"

                                : "○"}

                            </span>

                            <code>

                              {line}

                            </code>

                          </div>

                        )

                      )}

                    </div>

                    <div className="calculating-text">

                      {calculationStep <

                      candidates[

                        calculationMethod

                      ]?.calculations.length

                        ? "COMPUTING..."

                        : calculationMethod <

                            candidates.length -

                              1

                          ? "METHOD COMPLETE — LOADING NEXT METHOD"

                          : "ALL METHODS CALCULATED"}

                    </div>

                  </div>

                )}

                {calculationFinished && (

                  <div className="calculation-complete">

                    <div className="complete-icon">

                      ✓

                    </div>

                    <div>

                      <h3>

                        Both recovery procedures

                        calculated.

                      </h3>

                      <p>

                        No recovery command has

                        been executed. The system

                        has only simulated and

                        compared the candidate

                        procedures.

                      </p>

                    </div>

                  </div>

                )}

              </div>

            )}

            {/* GRAPH */}

            {plannerTab === "GRAPH" && (

              <div className="graph-view">

                <div className="graph-heading">

                  <div>

                    <span>

                      COMPARATIVE ANALYSIS

                    </span>

                    <h3>

                      Why one recovery procedure

                      is more suitable

                    </h3>

                  </div>

                  <div className="score-legend">

                    Higher suitability = better

                  </div>

                </div>

                <div className="graph-card">

                  {candidates.map(

                    (candidate) => (

                      <div

                        className="graph-row"

                        key={candidate.name}

                      >

                        <div className="graph-label">

                          <span

                            style={{

                              color:

                                candidate.color,

                            }}

                          >

                            ●

                          </span>

                          {candidate.short}

                        </div>

                        <div className="bar-track">

                          <div

                            className="bar-fill"

                            style={{

                              width: `${candidate.score}%`,

                              background:

                                candidate.color,

                              boxShadow: `0 0 18px ${candidate.color}66`,

                            }}

                          />

                        </div>

                        <strong>

                          {candidate.score}

                        </strong>

                      </div>

                    )

                  )}

                </div>

                <div className="metric-grid">

                  {candidates.map(

                    (candidate) => (

                      <div

                        className="metric-card"

                        key={candidate.name}

                      >

                        <h4>

                          {candidate.short}

                        </h4>

                        <div>

                          <span>

                            RECOVERY TIME

                          </span>

                          <b>

                            {candidate.metrics.recoveryTime.toFixed(

                              1

                            )}

                            s

                          </b>

                        </div>

                        <div>

                          <span>RISK</span>

                          <b>

                            {candidate.metrics.risk}

                            /100

                          </b>

                        </div>

                        <div>

                          <span>

                            MISSION IMPACT

                          </span>

                          <b>

                            {

                              candidate.metrics

                                .missionImpact

                            }

                            /100

                          </b>

                        </div>

                        <div>

                          <span>

                            CONSTRAINT FIT

                          </span>

                          <b>

                            {

                              candidate.metrics

                                .constraint

                            }

                            %

                          </b>

                        </div>

                      </div>

                    )

                  )}

                </div>

                <div className="weights-box">

                  <span>

                    DECISION MODEL WEIGHTS

                  </span>

                  <div>

                    <b>20%</b>{" "}

                    Recovery Time

                    <b>20%</b>{" "}

                    Resource

                    <b>25%</b>{" "}

                    Risk

                    <b>15%</b>{" "}

                    Mission Impact

                    <b>20%</b>{" "}

                    Constraint Fit

                  </div>

                </div>

              </div>

            )}

            {/* RESULT */}

            {plannerTab === "RESULT" &&

              calculationFinished &&

              selectedMethod && (

                <div className="result-view">

                  <div className="decision-banner">

                    <div className="decision-check">

                      ✓

                    </div>

                    <div>

                      <small>

                        SELECTED PROCEDURE

                      </small>

                      <h2>

                        {selectedMethod.name}

                      </h2>

                      <p>

                        Suitability score:{" "}

                        <strong>

                          {selectedMethod.score}

                          /100

                        </strong>

                      </p>

                    </div>

                  </div>

                  <div className="why-box">

                    <span>

                      WHY THIS METHOD?

                    </span>

                    <p>

                      {

                        selectedMethod.explanation

                      }

                    </p>

                  </div>

                  <div className="result-comparison">

                    {candidates.map(

                      (candidate) => (

                        <div

                          key={candidate.name}

                          className={

                            candidate.name ===

                            selectedMethod.name

                              ? "result-method selected"

                              : "result-method"

                          }

                        >

                          <div>

                            <h3>

                              {candidate.name}

                            </h3>

                            <span>

                              {candidate.name ===

                              selectedMethod.name

                                ? "SELECTED"

                                : "ALTERNATIVE"}

                            </span>

                          </div>

                          <strong>

                            {candidate.score}

                          </strong>

                        </div>

                      )

                    )}

                  </div>

                  <div className="evidence-gate">

                    <div>🔐</div>

                    <div>

                      <b>

                        EVIDENCE GATE READY

                      </b>

                      <span>

                        Candidate simulations,

                        constraints and decision

                        rationale have been

                        recorded.

                      </span>

                    </div>

                  </div>

                  <button

                    className="apply-button"

                    onClick={openProofGate}

                  >

                    VERIFY PROOF & AUTHORIZE

                    <span>→</span>

                  </button>

                </div>

              )}

          </div>

        </div>

      )}

      {proofGateOpen && (

        <div className="modal-backdrop">

          <div

            className="evidence-modal"

            style={{

              maxWidth: "720px",

              border: "1px solid #22d3ee",

              boxShadow: "0 0 45px rgba(34,211,238,0.18)",

            }}

          >

            <div className="planner-header">

              <div>

                <span>ZERO-TRUST // PROOF GATE</span>

                <h2>EVIDENCE VALIDATION</h2>

              </div>

              <button

                onClick={() => setProofGateOpen(false)}

              >

                ×

              </button>

            </div>


            <div

              style={{

                padding: "20px",

                display: "grid",

                gap: "12px",

              }}

            >

              <div

                style={{

                  color: "#22c55e",

                  fontWeight: 700,

                  letterSpacing: "0.08em",

                  fontSize: "14px",

                }}

              >

                ✓ ALL MACHINE-CHECKABLE PROOFS PASSED

              </div>


              <div

                style={{

                  display: "grid",

                  gap: "9px",

                }}

              >

                <div className="evidence-gate">

                  <div>✓</div>

                  <div><b>ANOMALY EVIDENCE</b><span>Active anomaly detected and contained.</span></div>

                </div>


                <div className="evidence-gate">

                  <div>✓</div>

                  <div><b>PHYSICS CALCULATIONS</b><span>All candidate recovery procedures were simulated.</span></div>

                </div>


                <div className="evidence-gate">

                  <div>✓</div>

                  <div><b>NUMERICAL VALIDITY</b><span>Recovery metrics and suitability scores are finite and valid.</span></div>

                </div>


                <div className="evidence-gate">

                  <div>✓</div>

                  <div><b>CONSTRAINT CHECK</b><span>Selected procedure satisfies the configured recovery constraint threshold.</span></div>

                </div>

              </div>


              <div

                style={{

                  marginTop: "6px",

                  padding: "14px 16px",

                  borderRadius: "12px",

                  background: "rgba(34,211,238,0.07)",

                  border: "1px solid rgba(34,211,238,0.2)",

                  color: "#cbd5e1",

                }}

              >

                <b style={{ color: "#e2e8f0" }}>SELECTED PROCEDURE:</b>{" "}

                {selectedMethod?.name}

                <br />

                <span style={{ color: "#94a3b8" }}>

                  No command is authorized until this evidence gate is explicitly passed.

                </span>

              </div>


              <button

                className="apply-button"

                onClick={authorizeRecovery}

              >

                AUTHORIZE & APPLY RECOVERY

                <span>→</span>

              </button>


              <button

                className="continue-button"

                onClick={() => setProofGateOpen(false)}

              >

                CANCEL

              </button>

            </div>

          </div>

        </div>

      )}


      {/* -------------------------------------------------

          EVIDENCE VAULT

      ------------------------------------------------- */}

      {evidenceOpen && (

        <div className="modal-backdrop">

          <div className="evidence-modal">

            <div className="planner-header">

              <div>

                <span>

                  ZERO-TRUST AUDIT TRAIL

                </span>

                <h2>EVIDENCE VAULT</h2>

              </div>

              <button

                onClick={() =>

                  setEvidenceOpen(false)

                }

              >

                ×

              </button>

            </div>

            <div className="evidence-intro">

              Every anomaly, simulation,

              constraint check, recovery decision

              and telemetry verification remains

              stored until RESET MISSION.

            </div>

            <div className="evidence-list">

              {evidence.length === 0 ? (

                <div className="empty-evidence">

                  NO EVIDENCE RECORDED

                </div>

              ) : (

                evidence.map((item) => (

                  <div

                    className="evidence-row"

                    key={item.id}

                  >

                    <div className="evidence-line">

                      <span />

                    </div>

                    <div className="evidence-content">

                      <div>

                        <span>

                          {item.time}

                        </span>

                        <b

                          className={`evidence-status ${item.status.toLowerCase()}`}

                        >

                          {item.status}

                        </b>

                      </div>

                      <strong>

                        {item.type}

                      </strong>

                      <p>

                        {item.detail}

                      </p>

                    </div>

                  </div>

                ))

              )}

            </div>

          </div>

        </div>

      )}

    </div>

  );

}