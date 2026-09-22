import {
  Activity,
  BrainCircuit,
  Play,
  ShieldCheck,
  Terminal,
} from "lucide-react";

interface MissionPanelProps {
  running: boolean;
  onExecute: () => void;
}

export default function MissionPanel({
  running,
  onExecute,
}: MissionPanelProps) {
  return (
    <aside className="side-panel left-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AUTONOMOUS CONTROL</span>

          <h2>Mission Control</h2>
        </div>

        <BrainCircuit size={20} className="cyan-icon" />
      </div>

      <div className="mission-card">
        <div className="card-label">ACTIVE OBJECTIVE</div>

        <p>
          Monitor satellite trajectory, detect anomalies and autonomously
          recover the spacecraft without unsafe commands.
        </p>
      </div>

      <button
        className={`execute-button ${running ? "executing" : ""}`}
        onClick={onExecute}
        disabled={running}
      >
        <Play size={17} />

        {running ? "AUTONOMOUS AGENT RUNNING" : "EXECUTE AUTONOMOUS AGENT"}
      </button>

      <div className="terminal-container">
        <div className="terminal-header">
          <div>
            <Terminal size={14} />
            AI AGENT LOG
          </div>

          <span className="terminal-live">● LIVE</span>
        </div>

        <div className="terminal-body">
          <Log time="12:03:15" type="AGENT" text="Goal received." />

          <Log
            time="12:03:17"
            type="AGENT"
            text="Analysing orbital telemetry..."
          />

          <Log
            time="12:03:19"
            type="SYSTEM"
            text="Monitoring attitude control."
          />

          <Log
            time="12:03:21"
            type="AGENT"
            text="Running independent evidence checks."
          />

          {running && (
            <>
              <Log
                time="12:03:23"
                type="WATCH"
                text="Z-axis drift detected."
                warning
              />

              <Log
                time="12:03:24"
                type="GATE"
                text="Awaiting physics verification..."
              />
            </>
          )}
        </div>
      </div>

      <div className="health-card">
        <div className="health-title">
          <Activity size={14} />
          SYSTEM HEALTH
          <span>98%</span>
        </div>

        <div className="health-bars">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={i < 10 ? "health-active" : ""} />
          ))}
        </div>
      </div>

      <div className="security-status">
        <ShieldCheck size={15} />

        <div>
          <strong>ZERO-TRUST GATEKEEPER</strong>
          <span>Every command requires machine-verifiable evidence.</span>
        </div>
      </div>
    </aside>
  );
}

function Log({
  time,
  type,
  text,
  warning = false,
}: {
  time: string;
  type: string;
  text: string;
  warning?: boolean;
}) {
  return (
    <div className="log-line">
      <span className="log-time">[{time}]</span>

      <span className={warning ? "log-type warning" : "log-type"}>{type}</span>

      <span className={warning ? "log-text warning" : "log-text"}>{text}</span>
    </div>
  );
}
