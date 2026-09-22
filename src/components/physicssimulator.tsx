import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Route,
  ShieldCheck,
  X,
} from "lucide-react";

interface PhysicsSimulatorProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function PhysicsSimulator({
  open,
  onClose,
  onComplete,
}: PhysicsSimulatorProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }

    const timers = [
      setTimeout(() => setStep(1), 700),
      setTimeout(() => setStep(2), 1800),
      setTimeout(() => setStep(3), 3100),
      setTimeout(() => setStep(4), 4500),
      setTimeout(() => setStep(5), 5700),
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="simulator-overlay">
      <div className="simulator-window">
        <div className="simulator-top">
          <div>
            <div className="simulator-eyebrow">
              ORBITGUARD-AI / PHYSICS ENGINE
            </div>

            <h1>Autonomous Recovery Simulation</h1>
          </div>

          <button className="close-button" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="simulation-grid">
          <div className="simulation-visual">
            <div className="sim-orbit old-orbit" />

            <div
              className={`sim-orbit new-orbit ${
                step >= 4 ? "show-new-orbit" : ""
              }`}
            />

            <div className="sim-earth" />

            <div className={`sim-rocket ${step >= 4 ? "rocket-repath" : ""}`}>
              🚀
            </div>

            {step >= 2 && <div className="vector-line" />}
          </div>

          <div className="simulation-console">
            <div className="console-title">
              <Cpu size={15} />
              PHYSICS ENGINE
            </div>

            <SimulationStep
              number="01"
              title="Detect anomaly"
              text="Z-axis attitude drift = 2.8°"
              active={step >= 1}
              complete={step >= 2}
            />

            <SimulationStep
              number="02"
              title="Identify root cause"
              text="Reaction wheel saturation"
              active={step >= 2}
              complete={step >= 3}
            />

            <SimulationStep
              number="03"
              title="Calculate correction"
              text="Δv = 0.42 m/s"
              active={step >= 3}
              complete={step >= 4}
            />

            <SimulationStep
              number="04"
              title="Generate new trajectory"
              text="Safe orbital path calculated"
              active={step >= 4}
              complete={step >= 5}
            />

            <SimulationStep
              number="05"
              title="Verify recovery"
              text="All constraints satisfied"
              active={step >= 5}
              complete={step >= 5}
            />
          </div>
        </div>

        {step >= 5 && (
          <div className="simulation-result">
            <div className="result-icon">
              <CheckCircle2 size={22} />
            </div>

            <div className="result-text">
              <strong>SELF-HEALING SOLUTION VERIFIED</strong>

              <span>
                Magnetorquer dump + trajectory correction applied successfully.
              </span>
            </div>

            <button
              onClick={() => {
                onComplete();
                onClose();
              }}
            >
              <ShieldCheck size={16} />
              APPLY RECOVERY
            </button>
          </div>
        )}

        <div className="root-cause">
          <div className="root-cause-title">
            <Route size={15} />
            WHY DID THIS HAPPEN?
          </div>

          <p>
            The spacecraft's reaction wheel accumulated excessive angular
            momentum during the attitude maneuver. This caused the wheel to
            approach its safe operating limit, producing a Z-axis attitude
            drift. The agent blocked the original command, simulated a
            momentum-dump manoeuvre, and generated a new trajectory before
            allowing recovery.
          </p>
        </div>
      </div>
    </div>
  );
}

function SimulationStep({
  number,
  title,
  text,
  active,
  complete,
}: {
  number: string;
  title: string;
  text: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className={`simulation-step ${active ? "step-active" : ""}`}>
      <div className={`step-number ${complete ? "step-complete" : ""}`}>
        {complete ? <CheckCircle2 size={14} /> : number}
      </div>

      <div className="step-content">
        <strong>{title}</strong>

        {active && <span>{text}</span>}
      </div>

      {active && !complete && (
        <Activity size={14} className="processing-icon" />
      )}
    </div>
  );
}
