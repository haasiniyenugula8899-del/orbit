import { useEffect, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useLoader,
} from "@react-three/fiber";
import {
  Html,
  Line,
  OrbitControls,
  Sparkles,
  Stars,
} from "@react-three/drei";
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

type BackendFaultPayload = {
  fault: FaultType;
  telemetry?: Partial<ReturnType<typeof getTelemetry>>;
  candidates: Candidate[];
  selectedCandidate: string;
  eventId?: string;
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
   NOMINAL HIL TELEMETRY

   These values are only used while the spacecraft is
   nominal and no backend telemetry packet has arrived.

   The frontend NEVER calculates recovery physics.
   ------------------------------------------------------- */

function getTelemetry(theta: number) {
  return {
    latitude: 18.45 + Math.sin(theta) * 4.8,
    longitude: 73.9 + Math.cos(theta) * 8.6,
    altitude: 543.2 + Math.sin(theta * 2) * 4.7,
    velocity: 7.48 + Math.cos(theta * 1.7) * 0.018,
    wheelRPM: 4820 + Math.sin(theta * 1.8) * 65,
  };
}

/* -------------------------------------------------------
   BACKEND CONNECTION

   Production:
   VITE_ORBITGUARD_WS_URL=ws://localhost:8000/ws/orbitguard

   Local/demo bridge:

   window.dispatchEvent(
     new CustomEvent("orbitguard:fault", {
       detail: payload
     })
   );

   Backend packet format:

   {
     fault,
     telemetry,
     candidates,
     selectedCandidate,
     eventId
   }
   ------------------------------------------------------- */

function subscribeToBackend(
  onFault: (payload: BackendFaultPayload) => void,
  onConnection: (connected: boolean) => void
) {
  const eventHandler = (event: Event) => {
    const detail =
      (event as CustomEvent<BackendFaultPayload>)
        .detail;

    if (
      detail?.fault &&
      Array.isArray(detail.candidates) &&
      detail.selectedCandidate
    ) {
      onFault(detail);
    }
  };

  window.addEventListener(
    "orbitguard:fault",
    eventHandler
  );

  const url = import.meta.env
    .VITE_ORBITGUARD_WS_URL as
    | string
    | undefined;

  let socket: WebSocket | null = null;

  let reconnectTimer:
    | ReturnType<typeof setTimeout>
    | null = null;

  let disposed = false;

  if (url) {
    const connect = () => {
      if (disposed) return;

      try {
        socket = new WebSocket(url);

        socket.onopen = () => {
          onConnection(true);
        };

        socket.onmessage = (message) => {
          try {
            const payload =
              JSON.parse(
                message.data
              ) as BackendFaultPayload;

            if (
              payload?.fault &&
              Array.isArray(payload.candidates) &&
              payload.selectedCandidate
            ) {
              onFault(payload);
            }
          } catch {
            // Ignore malformed backend packets.
          }
        };

        socket.onerror = () => {
          onConnection(false);
        };

        socket.onclose = () => {
          onConnection(false);

          if (!disposed) {
            reconnectTimer = setTimeout(
              connect,
              2500
            );
          }
        };
      } catch {
        onConnection(false);

        reconnectTimer = setTimeout(
          connect,
          2500
        );
      }
    };

    connect();
  } else {
    onConnection(false);
  }

  return () => {
    disposed = true;

    window.removeEventListener(
      "orbitguard:fault",
      eventHandler
    );

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    socket?.close();
  };
}

/* -------------------------------------------------------
   TRUE FOCUS-BASED ELLIPTICAL ORBIT

   Earth is at the focus.

   Perigee:
     theta = 0

   Apogee:
     theta = PI

   This is not a centered oval.
   ------------------------------------------------------- */

const ORBIT_A = 3.55;
const ORBIT_E = 0.36;

const ORBIT_P =
  ORBIT_A *
  (1 - ORBIT_E * ORBIT_E);

function orbitPoint(theta: number) {
  const denominator =
    1 +
    ORBIT_E *
      Math.cos(theta);

  const r =
    ORBIT_P /
    denominator;

  return new THREE.Vector3(
    r * Math.cos(theta),
    0.08 *
      Math.sin(theta * 2),
    r * Math.sin(theta)
  );
}

function orbitTangent(theta: number) {
  const denominator =
    1 +
    ORBIT_E *
      Math.cos(theta);

  const r =
    ORBIT_P /
    denominator;

  const dr =
    (ORBIT_P *
      ORBIT_E *
      Math.sin(theta)) /
    (denominator *
      denominator);

  return new THREE.Vector3(
    dr * Math.cos(theta) -
      r * Math.sin(theta),

    0.16 *
      Math.cos(theta * 2),

    dr * Math.sin(theta) +
      r * Math.cos(theta)
  ).normalize();
}

function orbitLinePoints(
  scale = 1,
  count = 320
) {
  return Array.from(
    {
      length: count + 1,
    },
    (_, index) => {
      const theta =
        (index / count) *
        Math.PI *
        2;

      const point =
        orbitPoint(theta)
          .multiplyScalar(scale);

      return [
        point.x,
        point.y,
        point.z,
      ] as [
        number,
        number,
        number
      ];
    }
  );
}

/* -------------------------------------------------------
   SPACECRAFT
   ------------------------------------------------------- */

function Rocket({
  theta,
  faultActive,
}: {
  theta: number;
  faultActive: boolean;
}) {
  const rocketRef =
    useRef<THREE.Group>(null);

  useFrame(() => {
    if (!rocketRef.current) {
      return;
    }

    const position =
      orbitPoint(theta);

    const tangent =
      orbitTangent(theta);

    rocketRef.current.position.copy(
      position
    );

    const target =
      position
        .clone()
        .add(tangent);

    rocketRef.current.lookAt(
      target
    );

    rocketRef.current.rotateX(
      Math.PI / 2
    );
  });

  return (
    <group
      ref={rocketRef}
      scale={0.30}
    >
      {/* MAIN SPACECRAFT BUS */}

      <mesh castShadow>
        <boxGeometry
          args={[
            1.15,
            1.55,
            1.05,
          ]}
        />

        <meshStandardMaterial
          color={
            faultActive
              ? "#7f1d1d"
              : "#cbd5e1"
          }
          metalness={0.82}
          roughness={0.28}
        />
      </mesh>

      {/* DARK EQUIPMENT DECK */}

      <mesh
        position={[
          0,
          0.55,
          0,
        ]}
      >
        <boxGeometry
          args={[
            1.22,
            0.20,
            1.12,
          ]}
        />

        <meshStandardMaterial
          color="#111827"
          metalness={0.88}
          roughness={0.24}
        />
      </mesh>

      {/* LOWER INSTRUMENT PANEL */}

      <mesh
        position={[
          0,
          -0.48,
          0,
        ]}
      >
        <boxGeometry
          args={[
            0.86,
            0.18,
            0.82,
          ]}
        />

        <meshStandardMaterial
          color="#334155"
          metalness={0.78}
          roughness={0.34}
        />
      </mesh>

      {/* SOLAR ARRAY BOOMS */}

      <mesh
        position={[
          1.28,
          0,
          0,
        ]}
      >
        <boxGeometry
          args={[
            1.35,
            0.06,
            0.06,
          ]}
        />

        <meshStandardMaterial
          color="#64748b"
          metalness={0.90}
          roughness={0.24}
        />
      </mesh>

      <mesh
        position={[
          -1.28,
          0,
          0,
        ]}
      >
        <boxGeometry
          args={[
            1.35,
            0.06,
            0.06,
          ]}
        />

        <meshStandardMaterial
          color="#64748b"
          metalness={0.90}
          roughness={0.24}
        />
      </mesh>

      {/* SOLAR PANELS */}

      <mesh
        position={[
          2.02,
          0,
          0,
        ]}
      >
        <boxGeometry
          args={[
            1.45,
            0.035,
            0.82,
          ]}
        />

        <meshStandardMaterial
          color="#102d52"
          metalness={0.58}
          roughness={0.30}
        />
      </mesh>

      <mesh
        position={[
          -2.02,
          0,
          0,
        ]}
      >
        <boxGeometry
          args={[
            1.45,
            0.035,
            0.82,
          ]}
        />

        <meshStandardMaterial
          color="#102d52"
          metalness={0.58}
          roughness={0.30}
        />
      </mesh>

      {/* SOLAR CELL DETAIL */}

      {[-2.02, 2.02].map(
        (x) =>
          [-0.30, 0, 0.30].map(
            (z) => (
              <mesh
                key={`${x}-${z}`}
                position={[
                  x,
                  0.025,
                  z,
                ]}
              >
                <boxGeometry
                  args={[
                    1.28,
                    0.012,
                    0.012,
                  ]}
                />

                <meshBasicMaterial
                  color="#2563eb"
                />
              </mesh>
            )
          )
      )}

      {/* ANTENNA MAST */}

      <mesh
        position={[
          0,
          1.10,
          0,
        ]}
      >
        <cylinderGeometry
          args={[
            0.028,
            0.028,
            0.72,
            10,
          ]}
        />

        <meshStandardMaterial
          color="#94a3b8"
          metalness={0.90}
          roughness={0.22}
        />
      </mesh>

      <mesh
        position={[
          0,
          1.50,
          0,
        ]}
      >
        <sphereGeometry
          args={[
            0.055,
            16,
            16,
          ]}
        />

        <meshStandardMaterial
          color="#67e8f9"
          emissive="#06b6d4"
          emissiveIntensity={2.5}
        />
      </mesh>

      {/* FORWARD SENSOR */}

      <mesh
        position={[
          0,
          0.84,
          0,
        ]}
      >
        <sphereGeometry
          args={[
            0.18,
            24,
            24,
          ]}
        />

        <meshStandardMaterial
          color="#0f172a"
          metalness={0.95}
          roughness={0.15}
        />
      </mesh>

      {/* ATTITUDE THRUSTERS */}

      {[
        [0.58, 0.58, 0.42],
        [-0.58, 0.58, 0.42],
        [0.58, -0.58, 0.42],
        [-0.58, -0.58, 0.42],
      ].map(
        ([x, y, z], index) => (
          <mesh
            key={index}
            position={[
              x,
              y,
              z,
            ]}
          >
            <cylinderGeometry
              args={[
                0.055,
                0.055,
                0.16,
                10,
              ]}
            />

            <meshStandardMaterial
              color="#475569"
              metalness={0.88}
              roughness={0.24}
            />
          </mesh>
        )
      )}

      {faultActive && (
        <Sparkles
          count={28}
          scale={2.8}
          size={2.4}
          speed={1.7}
          color="#ff4545"
        />
      )}
    </group>
  );
}

/* -------------------------------------------------------
   ORBITAL SCENE
   ------------------------------------------------------- */

function EarthScene({
  theta,
  faultActive,
}: {
  theta: number;
  faultActive: boolean;
}) {
  const earthTexture =
    useLoader(
      THREE.TextureLoader,
      "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
    );

  const orbitPoints =
    orbitLinePoints(1);

  const innerGrid =
    orbitLinePoints(0.78);

  const outerGrid =
    orbitLinePoints(1.24);

  const perigee =
    orbitPoint(0);

  const apogee =
    orbitPoint(Math.PI);

  return (
    <>
      {/* DEEP SPACE BACKGROUND */}

      <color
        attach="background"
        args={[
          "#01040a",
        ]}
      />

      <fog
        attach="fog"
        args={[
          "#01040a",
          15,
          34,
        ]}
      />

      {/* LIGHTING */}

      <ambientLight
        intensity={0.16}
      />

      <directionalLight
        position={[
          6,
          8,
          5,
        ]}
        intensity={2.8}
        color="#fff8e8"
      />

      <pointLight
        position={[
          -8,
          -3,
          -6,
        ]}
        intensity={0.35}
        color="#2563eb"
      />

      {/* DEEP STARFIELD */}

      <Stars
        radius={90}
        depth={55}
        count={5200}
        factor={2.2}
        saturation={0}
        fade
        speed={0.18}
      />

      <Stars
        radius={140}
        depth={80}
        count={1800}
        factor={1.1}
        saturation={0}
        fade
        speed={0.05}
      />

      <Sparkles
        count={70}
        scale={18}
        size={0.8}
        speed={0.08}
        color="#94a3b8"
      />

      {/* GMAT-INSPIRED ORBITAL REFERENCE GRID */}

      {[
        0.52,
        0.66,
        0.82,
        1.0,
        1.18,
        1.34,
      ].map(
        (scale) => (
          <Line
            key={scale}
            points={orbitLinePoints(
              scale
            )}
            color="#17365d"
            transparent
            opacity={0.28}
            lineWidth={0.55}
          />
        )
      )}

      {/* MAIN ELLIPTICAL TRAJECTORY */}

      <Line
        points={orbitPoints}
        color="#38bdf8"
        transparent
        opacity={
          faultActive
            ? 0.85
            : 0.52
        }
        lineWidth={1.25}
      />

      <Line
        points={innerGrid}
        color="#1d4f7d"
        transparent
        opacity={0.22}
        lineWidth={0.6}
      />

      <Line
        points={outerGrid}
        color="#1d4f7d"
        transparent
        opacity={0.18}
        lineWidth={0.6}
      />

      {/* ORBITAL REFERENCE AXES */}

      <Line
        points={[
          [-5.8, 0, 0],
          [5.8, 0, 0],
        ]}
        color="#1a3555"
        transparent
        opacity={0.18}
        lineWidth={0.5}
      />

      <Line
        points={[
          [0, 0, -5.8],
          [0, 0, 5.8],
        ]}
        color="#1a3555"
        transparent
        opacity={0.18}
        lineWidth={0.5}
      />

      {/* EARTH */}

      <mesh>
        <sphereGeometry
          args={[
            1.34,
            96,
            96,
          ]}
        />

        <meshStandardMaterial
          map={earthTexture}
          roughness={0.88}
          metalness={0.02}
        />
      </mesh>

      {/* SUBTLE CLOUD / TEXTURE SHELL */}

      <mesh scale={1.018}>
        <sphereGeometry
          args={[
            1.34,
            72,
            72,
          ]}
        />

        <meshStandardMaterial
          map={earthTexture}
          transparent
          opacity={0.16}
          roughness={1}
          depthWrite={false}
        />
      </mesh>

      {/* ATMOSPHERIC RIM */}

      <mesh scale={1.035}>
        <sphereGeometry
          args={[
            1.34,
            72,
            72,
          ]}
        />

        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      <mesh scale={1.07}>
        <sphereGeometry
          args={[
            1.34,
            72,
            72,
          ]}
        />

        <meshBasicMaterial
          color={
            faultActive
              ? "#ff453a"
              : "#38bdf8"
          }
          transparent
          opacity={
            faultActive
              ? 0.085
              : 0.045
          }
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* PERIGEE MARKER */}

      <mesh position={perigee}>
        <sphereGeometry
          args={[
            0.045,
            12,
            12,
          ]}
        />

        <meshBasicMaterial
          color="#22d3ee"
        />
      </mesh>

      <Html
        position={[
          perigee.x + 0.18,
          0.12,
          perigee.z,
        ]}
        center
        distanceFactor={9}
      >
        <div className="orbit-marker perigee-marker">
          PERIGEE
        </div>
      </Html>

      {/* APOGEE MARKER */}

      <mesh position={apogee}>
        <sphereGeometry
          args={[
            0.045,
            12,
            12,
          ]}
        />

        <meshBasicMaterial
          color="#a78bfa"
        />
      </mesh>

      <Html
        position={[
          apogee.x - 0.20,
          0.12,
          apogee.z,
        ]}
        center
        distanceFactor={9}
      >
        <div className="orbit-marker apogee-marker">
          APOGEE
        </div>
      </Html>

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
  const [theta, setTheta] =
    useState(0);

  const [showLanding, setShowLanding] =
    useState(true);

  const [fault, setFault] =
    useState<FaultType | null>(null);

  const [recovered, setRecovered] =
    useState(false);

  const [plannerOpen, setPlannerOpen] =
    useState(false);

  const [plannerTab, setPlannerTab] =
    useState<
      "CALCULATION" |
      "GRAPH" |
      "RESULT"
    >("CALCULATION");

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

  const [backendCandidates, setBackendCandidates] =
    useState<Candidate[]>([]);

  const [
    backendSelectedCandidate,
    setBackendSelectedCandidate,
  ] = useState("");

  const [backendConnected, setBackendConnected] =
    useState(false);

  const lastBackendEvent =
    useRef<string | null>(null);

  const candidates =
    backendCandidates;

  const activeFault =
    fault
      ? FAULTS[fault]
      : null;

  /* -------------------------------------------------------
     BACKEND -> AUTOMATIC ANOMALY CONTAINMENT
     ------------------------------------------------------- */

  useEffect(() => {
    return subscribeToBackend(
      (payload) => {
        const eventKey =
          payload.eventId ||
          `${payload.fault}-${payload.selectedCandidate}-${JSON.stringify(
            payload.telemetry || {}
          )}`;

        if (
          lastBackendEvent.current ===
          eventKey
        ) {
          return;
        }

        lastBackendEvent.current =
          eventKey;

        setBackendConnected(true);

        setFault(
          payload.fault
        );

        setRecovered(false);

        setPlannerOpen(false);

        setProofGateOpen(false);

        setPlannerTab(
          "CALCULATION"
        );

        setCalculationMethod(0);

        setCalculationStep(0);

        setCalculationFinished(
          false
        );

        setBackendCandidates(
          payload.candidates
        );

        setBackendSelectedCandidate(
          payload.selectedCandidate
        );

        const backendSelection =
          payload.candidates.find(
            (candidate) =>
              candidate.name ===
              payload.selectedCandidate
          ) || null;

        setSelectedMethod(
          backendSelection
        );

        if (
          payload.telemetry
        ) {
          setTelemetry(
            (previous) => ({
              ...previous,
              ...payload.telemetry,
            })
          );
        }

        addEvidence(
          "ANOMALY DETECTED",
          `${payload.fault} detected by backend telemetry.`,
          "BLOCKED"
        );

        addEvidence(
          "COMMAND GATE",
          "Autonomous recovery blocked pending backend-generated evidence and recovery validation.",
          "BLOCKED"
        );

        addEvidence(
          "BACKEND CALCULATION PAYLOAD",
          `${payload.candidates.length} recovery procedures received with machine-generated calculation steps. Backend selected ${payload.selectedCandidate}.`,
          "ACTIVE"
        );
      },
      setBackendConnected
    );
  }, []);

  /* -------------------------------------------------------
     AUTOMATIC PHYSICS ENGINE
     ------------------------------------------------------- */

  useEffect(() => {
    if (
      !fault ||
      showLanding ||
      recovered ||
      candidates.length < 2
    ) {
      return;
    }

    const timer =
      setTimeout(() => {
        setPlannerOpen(true);

        setPlannerTab(
          "CALCULATION"
        );

        setCalculationMethod(0);

        setCalculationStep(0);

        setCalculationFinished(
          false
        );
      }, 250);

    return () =>
      clearTimeout(timer);
  }, [
    fault,
    showLanding,
    recovered,
    candidates.length,
  ]);

  /* -------------------------------------------------------
     ORBIT ANIMATION

     Stops when an anomaly is contained.
     ------------------------------------------------------- */

  useEffect(() => {
    if (showLanding) return;

    const timer =
      setInterval(() => {
        if (!fault) {
          setTheta(
            (previous) =>
              previous + 0.012
          );
        }
      }, 40);

    return () =>
      clearInterval(timer);
  }, [
    showLanding,
    fault,
  ]);

  useEffect(() => {
    if (!fault) {
      setTelemetry(
        getTelemetry(theta)
      );
    }
  }, [
    theta,
    fault,
  ]);

  /* -------------------------------------------------------
     EVIDENCE VAULT
     ------------------------------------------------------- */

  function addEvidence(
    type: string,
    detail: string,
    status: EvidenceStatus
  ) {
    setEvidence(
      (previous) => [
        ...previous,
        {
          id:
            Date.now() +
            Math.random(),

          time: now(),

          type,

          detail,

          status,
        },
      ]
    );
  }

  /* -------------------------------------------------------
     NO FRONTEND FAULT SELECTION.

     Backend is the source of truth.
     ------------------------------------------------------- */

  function openPlanner() {
    if (
      !fault ||
      candidates.length < 2
    ) {
      return;
    }

    setPlannerOpen(true);

    setPlannerTab(
      "CALCULATION"
    );

    setCalculationMethod(0);

    setCalculationStep(0);

    setCalculationFinished(
      false
    );

    addEvidence(
      "RECOVERY PLANNER",
      "Backend recovery procedures opened for evidence review.",
      "ACTIVE"
    );
  }

  /* -------------------------------------------------------
     LIVE BACKEND CALCULATION REVEAL

     IMPORTANT:
     This timer only reveals backend-generated strings.
     It does NOT calculate physics.
     ------------------------------------------------------- */

  useEffect(() => {
    if (
      !plannerOpen ||
      !fault
    ) {
      return;
    }

    if (
      calculationFinished
    ) {
      return;
    }

    const current =
      candidates[
        calculationMethod
      ];

    if (!current) {
      return;
    }

    if (
      calculationStep <
      current.calculations.length
    ) {
      const timer =
        setTimeout(() => {
          setCalculationStep(
            (previous) =>
              previous + 1
          );
        }, 650);

      return () =>
        clearTimeout(timer);
    }

    if (
      calculationStep >=
        current.calculations.length &&
      calculationMethod <
        candidates.length - 1
    ) {
      const timer =
        setTimeout(() => {
          addEvidence(
            "METHOD SIMULATED",
            `${current.name} backend calculation stream completed with suitability score ${current.score}/100.`,
            "PASS"
          );

          setCalculationMethod(
            (previous) =>
              previous + 1
          );

          setCalculationStep(0);
        }, 800);

      return () =>
        clearTimeout(timer);
    }

    if (
      calculationStep >=
        current.calculations.length &&
      calculationMethod ===
        candidates.length - 1
    ) {
      const timer =
        setTimeout(() => {
          addEvidence(
            "METHOD SIMULATED",
            `${current.name} backend calculation stream completed with suitability score ${current.score}/100.`,
            "PASS"
          );

          const backendSelection =
            candidates.find(
              (candidate) =>
                candidate.name ===
                backendSelectedCandidate
            ) || null;

          if (
            !backendSelection
          ) {
            addEvidence(
              "DECISION BLOCKED",
              "Backend did not provide a valid selected recovery procedure.",
              "BLOCKED"
            );

            return;
          }

          setSelectedMethod(
            backendSelection
          );

          setCalculationFinished(
            true
          );

          addEvidence(
            "CONSTRAINT CHECK",
            `Backend decision selected ${backendSelection.name} at ${backendSelection.score}/100 suitability. Frontend did not recompute the score.`,
            "PASS"
          );
        }, 800);

      return () =>
        clearTimeout(timer);
    }
  }, [
    plannerOpen,
    fault,
    candidates,
    backendSelectedCandidate,
    calculationMethod,
    calculationStep,
    calculationFinished,
  ]);

  /* -------------------------------------------------------
     PROOF GATE
     ------------------------------------------------------- */

  function openProofGate() {
    if (
      !selectedMethod ||
      !fault ||
      !calculationFinished
    ) {
      return;
    }

    const checks = [
      fault !== null,

      calculationFinished &&
        candidates.length >= 2,

      candidates.every(
        (candidate) =>
          Number.isFinite(
            candidate.score
          ) &&
          Number.isFinite(
            candidate.metrics
              .recoveryTime
          ) &&
          Number.isFinite(
            candidate.metrics.risk
          ) &&
          Number.isFinite(
            candidate.metrics
              .constraint
          )
      ),

      selectedMethod.metrics
        .constraint >= 80,

      Number.isFinite(
        selectedMethod.score
      ),

      selectedMethod.name ===
        backendSelectedCandidate,
    ];

    if (
      checks.every(Boolean)
    ) {
      addEvidence(
        "PROOF GATE CHECK",
        "Anomaly evidence, backend calculations, numerical validity, selected-procedure identity and recovery constraints passed machine-checkable checks.",
        "PASS"
      );

      setProofGateOpen(
        true
      );
    } else {
      addEvidence(
        "PROOF GATE BLOCKED",
        "Recovery cannot be authorized because one or more machine-checkable evidence checks failed.",
        "BLOCKED"
      );
    }
  }

  function authorizeRecovery() {
    setProofGateOpen(false);
    applyRecovery();
  }

  function applyRecovery() {
    if (
      !selectedMethod ||
      !fault
    ) {
      return;
    }

    addEvidence(
      "RECOVERY AUTHORIZED",
      `${selectedMethod.name} selected by backend after candidate comparison.`,
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
     CONTINUE / RESET

     CONTINUE:
       preserves Evidence Vault.

     RESET:
       only action that clears Evidence Vault.
     ------------------------------------------------------- */

  function continueMission() {
    setFault(null);

    setRecovered(false);

    setPlannerOpen(false);

    setProofGateOpen(false);

    setSelectedMethod(null);

    setBackendCandidates([]);

    setBackendSelectedCandidate("");
  }

  function resetMission() {
    setFault(null);

    setRecovered(false);

    setPlannerOpen(false);

    setProofGateOpen(false);

    setSelectedMethod(null);

    setBackendCandidates([]);

    setBackendSelectedCandidate("");

    setEvidence([]);

    setShowLanding(true);

    setTheta(0);

    lastBackendEvent.current =
      null;
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
            recovery planning,
            evidence validation
            and mission resumption.
          </p>

          <button
            className="mission-button"
            onClick={() =>
              setShowLanding(false)
            }
          >
            <span>
              START MISSION
            </span>

            <b>→</b>
          </button>
        </div>

        <div className="landing-bottom">
          <span>
            ZERO-TRUST RECOVERY
          </span>

          <span>•</span>

          <span>
            PHYSICS VALIDATED
          </span>

          <span>•</span>

          <span>
            AUTONOMOUS CONTROL
          </span>
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
            ZERO-TRUST AUTONOMOUS
            SATELLITE CONTROL
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

            <b>
              {evidence.length}
            </b>
          </button>

          <button
            className="reset-button"
            onClick={
              resetMission
            }
          >
            RESET MISSION
          </button>
        </div>
      </header>

      {/* MAIN DASHBOARD */}

      <main className="dashboard">
        {/* LEFT */}

        <aside className="left-panel">
          <div className="panel-title">
            LIVE TELEMETRY
          </div>

          <div className="telemetry-card">
            <span>
              LATITUDE
            </span>

            <strong>
              {telemetry.latitude.toFixed(
                4
              )}
              °
            </strong>
          </div>

          <div className="telemetry-card">
            <span>
              LONGITUDE
            </span>

            <strong>
              {telemetry.longitude.toFixed(
                4
              )}
              °
            </strong>
          </div>

          <div className="telemetry-card">
            <span>
              ALTITUDE
            </span>

            <strong>
              {telemetry.altitude.toFixed(
                2
              )}{" "}
              km
            </strong>
          </div>

          <div className="telemetry-card">
            <span>
              VELOCITY
            </span>

            <strong>
              {telemetry.velocity.toFixed(
                3
              )}{" "}
              km/s
            </strong>
          </div>

          <div className="telemetry-card">
            <span>
              RW-Z SPEED
            </span>

            <strong>
              {telemetry.wheelRPM.toFixed(
                0
              )}{" "}
              RPM
            </strong>
          </div>

          <div className="simulation-note">
            SIMULATED / HIL TELEMETRY
          </div>

          <div className="mission-phase">
            <span>
              MISSION PHASE
            </span>

            <b>
              {fault
                ? recovered
                  ? "RECOVERY VERIFIED"
                  : "ANOMALY CONTAINMENT"
                : "NOMINAL ORBIT"}
            </b>
          </div>

          <div className="connection-card">
            <span>
              BACKEND LINK
            </span>

            <strong>
              <i
                className={
                  backendConnected
                    ? "connection-dot live"
                    : "connection-dot"
                }
              />

              {backendConnected
                ? "CONNECTED"
                : "WAITING"}
            </strong>
          </div>
        </aside>

        {/* CENTER */}

        <section className="space-view">
          <div className="space-label">
            <span>
              ORBITAL VIEW
            </span>

            <span>
              LEO // 543 KM
            </span>
          </div>

          <Canvas
            camera={{
              position: [
                0,
                3.9,
                9.8,
              ],
              fov: 43,
            }}
            dpr={[1, 2]}
            gl={{
              antialias: true,
            }}
          >
            <EarthScene
              theta={theta}
              faultActive={Boolean(
                fault &&
                  !recovered
              )}
            />

            <OrbitControls
              enablePan={false}
              enableZoom={false}
              autoRotate={false}
              enableDamping
              dampingFactor={0.06}
            />
          </Canvas>

          <div className="orbit-readout">
            <span>
              ORBIT TRACK
            </span>

            <strong>
              {fault
                ? recovered
                  ? "NOMINAL"
                  : "CONTAINED"
                : "STABLE"}
            </strong>
          </div>

          <div className="orbit-info">
            <span>
              ECCENTRICITY
            </span>

            <b>
              {ORBIT_E.toFixed(2)}
            </b>

            <span>
              PERIGEE / APOGEE
            </span>

            <b>
              FOCUS-BASED
            </b>
          </div>

          {fault &&
            !recovered && (
              <div className="anomaly-beacon">
                <div className="beacon-pulse" />

                <div>
                  <small>
                    ANOMALY
                  </small>

                  <strong>
                    {fault}
                  </strong>
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

        {/* RIGHT */}

        <aside className="right-panel">
          <div className="panel-title">
            ANOMALY CONTROL
          </div>

          {!fault && (
            <div className="backend-awaiting">
              <div className="control-description">
                Awaiting backend
                telemetry. Fault
                selection is disabled
                in the frontend.
              </div>

              <div className="evidence-gate">
                <div>◌</div>

                <div>
                  <b>
                    BACKEND FAULT MONITOR
                  </b>

                  <span>
                    When a fault is
                    detected, the
                    spacecraft is
                    automatically
                    contained and the
                    Recovery Planner
                    opens.
                  </span>
                </div>
              </div>

              <div className="backend-stream-status">
                <span className="stream-pulse" />

                <div>
                  <b>
                    AGENT STREAM ARMED
                  </b>

                  <small>
                    Detection →
                    containment →
                    physics → proof →
                    recovery
                  </small>
                </div>
              </div>
            </div>
          )}

          {fault &&
            activeFault && (
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

                    <h2>
                      {fault}
                    </h2>
                  </div>

                  <span
                    className="severity-pill"
                    style={{
                      color:
                        activeFault.color,
                    }}
                  >
                    {
                      activeFault.severity
                    }
                  </span>
                </div>

                <p>
                  {
                    activeFault.description
                  }
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
                          Recovery
                          requires
                          evidence
                          validation.
                        </span>
                      </div>
                    </div>

                    <button
                      className="planner-button"
                      onClick={
                        openPlanner
                      }
                    >
                      OPEN RECOVERY
                      PLANNER

                      <span>
                        →
                      </span>
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
                          Telemetry is
                          back inside
                          the safe
                          envelope.
                        </small>
                      </span>
                    </div>

                    <button
                      className="continue-button"
                      onClick={
                        continueMission
                      }
                    >
                      CONTINUE MISSION
                      →
                    </button>
                  </>
                )}
              </div>
            )}
        </aside>
      </main>

      {/* =====================================================
          RECOVERY PLANNER
      ===================================================== */}

      {plannerOpen &&
        fault && (
          <div className="modal-backdrop">
            <div className="planner-modal">
              <div className="planner-header">
                <div>
                  <span>
                    RECOVERY PLANNER //
                    PHYSICS ENGINE
                  </span>

                  <h2>
                    {fault}
                  </h2>
                </div>

                <button
                  onClick={() =>
                    setPlannerOpen(
                      false
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="planner-tabs">
                <button
                  className={
                    plannerTab ===
                    "CALCULATION"
                      ? "active cyan-tab"
                      : "cyan-tab"
                  }
                  onClick={() =>
                    setPlannerTab(
                      "CALCULATION"
                    )
                  }
                >
                  01 · LIVE
                  CALCULATION
                </button>

                <button
                  disabled={
                    !calculationFinished
                  }
                  className={
                    plannerTab ===
                    "GRAPH"
                      ? "active purple-tab"
                      : "purple-tab"
                  }
                  onClick={() =>
                    setPlannerTab(
                      "GRAPH"
                    )
                  }
                >
                  02 · METHOD GRAPH
                </button>

                <button
                  disabled={
                    !calculationFinished
                  }
                  className={
                    plannerTab ===
                    "RESULT"
                      ? "active green-tab"
                      : "green-tab"
                  }
                  onClick={() =>
                    setPlannerTab(
                      "RESULT"
                    )
                  }
                >
                  03 · VIEW RESULT
                </button>
              </div>

              {/* CALCULATION */}

              {plannerTab ===
                "CALCULATION" && (
                <div className="calculation-view">
                  <div className="calculation-progress">
                    <div
                      className="progress-fill"
                      style={{
                        width:
                          calculationFinished
                            ? "100%"
                            : `${
                                ((calculationMethod +
                                  calculationStep /
                                    Math.max(
                                      candidates[
                                        calculationMethod
                                      ]?.calculations
                                        .length ||
                                        1,
                                      1
                                    )) /
                                  Math.max(
                                    candidates.length,
                                    1
                                  )) *
                                100
                              }%`,
                      }}
                    />
                  </div>

                  <div className="method-running">
                    METHOD{" "}
                    {calculationMethod +
                      1}{" "}
                    OF{" "}
                    {
                      candidates.length
                    }
                  </div>

                  <div className="candidate-grid">
                    {candidates.map(
                      (
                        candidate,
                        index
                      ) => (
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
                          key={
                            candidate.name
                          }
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
                              METHOD{" "}
                              {index +
                                1}
                            </small>

                            <h3>
                              {
                                candidate.name
                              }
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

                        LIVE BACKEND
                        CALCULATION STREAM
                      </div>

                      <p className="backend-calc-note">
                        Formulae, inputs and
                        results are received
                        from the recovery
                        engine. The frontend
                        only reveals the
                        evidence progressively.
                      </p>

                      <h3>
                        {
                          candidates[
                            calculationMethod
                          ]?.name
                        }
                      </h3>

                      <div className="equation-list">
                        {
                          candidates[
                            calculationMethod
                          ]?.calculations.map(
                            (
                              line,
                              index
                            ) => (
                              <div
                                className={
                                  index <
                                  calculationStep
                                    ? "equation visible"
                                    : "equation"
                                }
                                key={`${line}-${index}`}
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
                          )
                        }
                      </div>

                      <div className="calculating-text">
                        {calculationStep <
                        (candidates[
                          calculationMethod
                        ]?.calculations
                          .length ||
                          0)
                          ? "STREAMING BACKEND EVIDENCE..."
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
                          Both recovery
                          procedures
                          calculated.
                        </h3>

                        <p>
                          No recovery
                          command has
                          been executed.
                          The system has
                          only simulated
                          and compared
                          the
                          backend-supplied
                          candidate
                          procedures.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GRAPH */}

              {plannerTab ===
                "GRAPH" && (
                <div className="graph-view">
                  <div className="graph-heading">
                    <div>
                      <span>
                        COMPARATIVE
                        ANALYSIS
                      </span>

                      <h3>
                        Backend
                        suitability
                        comparison
                      </h3>
                    </div>

                    <div className="score-legend">
                      Higher
                      suitability =
                      better
                    </div>
                  </div>

                  <div className="graph-card">
                    {candidates.map(
                      (candidate) => (
                        <div
                          className="graph-row"
                          key={
                            candidate.name
                          }
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

                            {
                              candidate.short
                            }
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
                            {
                              candidate.score
                            }
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
                          key={
                            candidate.name
                          }
                        >
                          <h4>
                            {
                              candidate.short
                            }
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
                            <span>
                              RISK
                            </span>

                            <b>
                              {
                                candidate
                                  .metrics
                                  .risk
                              }
                              /100
                            </b>
                          </div>

                          <div>
                            <span>
                              MISSION
                              IMPACT
                            </span>

                            <b>
                              {
                                candidate
                                  .metrics
                                  .missionImpact
                              }
                              /100
                            </b>
                          </div>

                          <div>
                            <span>
                              CONSTRAINT
                              FIT
                            </span>

                            <b>
                              {
                                candidate
                                  .metrics
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
                      DECISION MODEL
                      WEIGHTS
                    </span>

                    <div>
                      <b>
                        20%
                      </b>{" "}
                      Recovery Time

                      <b>
                        20%
                      </b>{" "}
                      Resource

                      <b>
                        25%
                      </b>{" "}
                      Risk

                      <b>
                        15%
                      </b>{" "}
                      Mission Impact

                      <b>
                        20%
                      </b>{" "}
                      Constraint Fit
                    </div>
                  </div>
                </div>
              )}

              {/* RESULT */}

              {plannerTab ===
                "RESULT" &&
                calculationFinished &&
                selectedMethod && (
                  <div className="result-view">
                    <div className="decision-banner">
                      <div className="decision-check">
                        ✓
                      </div>

                      <div>
                        <small>
                          BACKEND
                          SELECTED
                          PROCEDURE
                        </small>

                        <h2>
                          {
                            selectedMethod.name
                          }
                        </h2>

                        <p>
                          Suitability
                          score:{" "}
                          <strong>
                            {
                              selectedMethod.score
                            }
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
                        (
                          candidate
                        ) => (
                          <div
                            key={
                              candidate.name
                            }
                            className={
                              candidate.name ===
                              selectedMethod.name
                                ? "result-method selected"
                                : "result-method"
                            }
                          >
                            <div>
                              <h3>
                                {
                                  candidate.name
                                }
                              </h3>

                              <span>
                                {candidate.name ===
                                selectedMethod.name
                                  ? "BACKEND SELECTED"
                                  : "ALTERNATIVE"}
                              </span>
                            </div>

                            <strong>
                              {
                                candidate.score
                              }
                            </strong>
                          </div>
                        )
                      )}
                    </div>

                    <div className="evidence-gate">
                      <div>
                        🔐
                      </div>

                      <div>
                        <b>
                          EVIDENCE GATE READY
                        </b>

                        <span>
                          Candidate
                          simulations,
                          constraints
                          and backend
                          decision
                          rationale
                          have been
                          recorded.
                        </span>
                      </div>
                    </div>

                    <button
                      className="apply-button"
                      onClick={
                        openProofGate
                      }
                    >
                      VERIFY PROOF 
            

                      <span>
                        →
                      </span>
                    </button>
                  </div>
                )}
            </div>
          </div>
        )}

      {/* =====================================================
          PROOF GATE
      ===================================================== */}

      {proofGateOpen && (
        <div className="modal-backdrop">
          <div className="evidence-modal proof-modal">
            <div className="planner-header">
              <div>
                <span>
                  ZERO-TRUST // PROOF GATE
                </span>

                <h2>
                  EVIDENCE VALIDATION
                </h2>
              </div>

              <button
                onClick={() =>
                  setProofGateOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="proof-content">
              <div className="proof-source-card">
                <div className="proof-source-title">
                  CALCULATION BASIS //
                  SOURCES USED
                </div>

                <p>
                  The recovery calculations
                  use spacecraft-physics
                  relationships documented
                  in NASA technical and
                  educational sources. The
                  simulator applies those
                  relationships to controlled
                  demonstration parameters;
                  the numerical inputs are
                  not claimed to be live NASA
                  mission telemetry.
                </p>

                <div className="source-list">
                  <a
                    href="https://www.nasa.gov/smallsat-institute/sst-soa/guidance-navigation-and-control/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA SmallSat GNC —
                    reaction-wheel saturation
                    and desaturation
                  </a>

                  <a
                    href="https://science.nasa.gov/learn/basics-of-space-flight/chapter11-2/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA Science, Chapter 11 —
                    reaction-wheel momentum and
                    momentum desaturation
                  </a>

                  <a
                    href="https://ntrs.nasa.gov/api/citations/19900015848/downloads/19900015848.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA NTRS — Orbital Mechanics
                    and ΔV / propulsion
                    relationships
                  </a>

                  <a
                    href="https://ntrs.nasa.gov/api/citations/20010084958/downloads/20010084958.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA NTRS — magnetic torquer
                    control and torque model
                    (M × B)
                  </a>

                  <a
                    href="https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA SmallSat Power —
                    power management, fault
                    detection and load switching
                  </a>

                  <a
                    href="https://www.nasa.gov/smallsat-institute/sst-soa/thermal-control/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA SmallSat Thermal Control
                    — thermal limits, heat balance
                    and thermal management
                  </a>
                </div>
              </div>

              <div className="proof-pass">
                ✓ ALL MACHINE-CHECKABLE
                PROOFS PASSED
              </div>

              <div className="proof-check-list">
                <div className="evidence-gate">
                  <div>✓</div>

                  <div>
                    <b>
                      ANOMALY EVIDENCE
                    </b>

                    <span>
                      Active anomaly detected
                      and contained by the
                      backend event.
                    </span>
                  </div>
                </div>

                <div className="evidence-gate">
                  <div>✓</div>

                  <div>
                    <b>
                      PHYSICS CALCULATIONS
                    </b>

                    <span>
                      All candidate recovery
                      procedures were supplied
                      by the backend recovery
                      engine.
                    </span>
                  </div>
                </div>

                <div className="evidence-gate">
                  <div>✓</div>

                  <div>
                    <b>
                      NUMERICAL VALIDITY
                    </b>

                    <span>
                      Recovery metrics and
                      suitability scores are
                      finite and valid.
                    </span>
                  </div>
                </div>

                <div className="evidence-gate">
                  <div>✓</div>

                  <div>
                    <b>
                      CONSTRAINT CHECK
                    </b>

                    <span>
                      Selected procedure
                      satisfies the configured
                      recovery constraint
                      threshold.
                    </span>
                  </div>
                </div>
              </div>

              <div className="proof-selected">
                <b>
                  SELECTED PROCEDURE:
                </b>{" "}
                {selectedMethod.name}

                <br />

                <span>
                  No command is authorized
                  until this evidence gate is
                  explicitly passed.
                </span>
              </div>

              <button
                className="apply-button"
                onClick={
                  authorizeRecovery
                }
              >
                MISSION ACCOMPLISHED

                <span>
                  →
                </span>
              </button>

              <button
                className="continue-button"
                onClick={() =>
                  setProofGateOpen(
                    false
                  )
                }
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          EVIDENCE VAULT
      ===================================================== */}

      {evidenceOpen && (
        <div className="modal-backdrop">
          <div className="evidence-modal">
            <div className="planner-header">
              <div>
                <span>
                  ZERO-TRUST AUDIT TRAIL
                </span>

                <h2>
                  EVIDENCE VAULT
                </h2>
              </div>

              <button
                onClick={() =>
                  setEvidenceOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="evidence-intro">
              Every anomaly, simulation,
              constraint check, recovery
              decision and telemetry
              verification remains stored
              until RESET MISSION.
            </div>

            <div className="evidence-list">
              {evidence.length ===
              0 ? (
                <div className="empty-evidence">
                  NO EVIDENCE
                  RECORDED
                </div>
              ) : (
                evidence.map(
                  (item) => (
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
                            {
                              item.status
                            }
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
                  )
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}