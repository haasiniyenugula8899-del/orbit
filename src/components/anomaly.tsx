import { AlertTriangle, Crosshair, MapPin, Satellite, Zap } from "lucide-react";

interface AnomalyPanelProps {
  visible: boolean;
  onOpenSimulator: () => void;
  healed: boolean;
}

export default function AnomalyPanel({
  visible,
  onOpenSimulator,
  healed,
}: AnomalyPanelProps) {
  if (!visible) {
    return (
      <aside className="side-panel right-panel normal-status">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SATELLITE STATUS</span>

            <h2>Nominal</h2>
          </div>

          <Satellite className="green-icon" />
        </div>

        <div className="nominal-circle">
          <div>
            <span>ORBIT</span>
            <strong>STABLE</strong>
          </div>
        </div>

        <div className="coordinate-box">
          <div className="card-label">CURRENT POSITION</div>

          <Coordinate label="X" value="-2187.442 km" />
          <Coordinate label="Y" value="5324.781 km" />
          <Coordinate label="Z" value="1487.326 km" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="side-panel right-panel anomaly-panel">
      <div className="anomaly-header">
        <div className="anomaly-title">
          <AlertTriangle size={18} />
          ANOMALY DETECTED
        </div>

        <span className="severity">HIGH</span>
      </div>

      <div className="issue-box">
        <div className="issue-label">ATTITUDE CONTROL FAILURE</div>

        <h3>Z-AXIS DRIFT</h3>

        <p>
          Reaction wheel saturation has pushed the spacecraft outside its safe
          attitude threshold.
        </p>
      </div>

      <div className="coordinate-box">
        <div className="card-label">ROCKET POSITION • ECI</div>

        <Coordinate label="X" value="-2187.442 km" />

        <Coordinate label="Y" value="5324.781 km" />

        <Coordinate label="Z" value="1487.326 km" />
      </div>

      <div className="telemetry-mini">
        <MiniMetric label="ATTITUDE ERROR" value="2.8°" danger />

        <MiniMetric label="THRESHOLD" value="1.0°" />

        <MiniMetric label="VELOCITY" value="7.68 km/s" />
      </div>

      {!healed && (
        <button className="physics-button" onClick={onOpenSimulator}>
          <Zap size={18} />

          <div>
            <strong>OPEN PHYSICS SIMULATOR</strong>

            <span>Analyse failure & calculate recovery</span>
          </div>
        </button>
      )}

      {healed && (
        <div className="recovery-complete">
          <Crosshair size={18} />

          <div>
            <strong>TRAJECTORY RESTORED</strong>

            <span>Autonomous recovery verified</span>
          </div>
        </div>
      )}
    </aside>
  );
}

function Coordinate({ label, value }: { label: string; value: string }) {
  return (
    <div className="coordinate-row">
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="mini-metric">
      <span>{label}</span>

      <strong className={danger ? "danger-text" : ""}>{value}</strong>
    </div>
  );
}
