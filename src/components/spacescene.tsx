import { Rocket, Radio } from "lucide-react";

interface SpaceSceneProps {
  anomaly: boolean;
  healed: boolean;
  paused: boolean;
}

export default function SpaceScene({
  anomaly,
  healed,
  paused,
}: SpaceSceneProps) {
  return (
    <div className="space-scene">
      <div className="scene-header">
        <div className="scene-title">
          <span className="live-dot" />
          ORBITAL DIGITAL TWIN
        </div>

        <div className="scene-coordinates">LEO • 408 KM • 51.6°</div>
      </div>

      <div className="stars stars-one" />
      <div className="stars stars-two" />

      {/* Orbit rings */}

      <div className="orbit orbit-one">
        <div className={`rocket ${paused ? "rocket-paused" : ""}`}>
          <Rocket size={27} strokeWidth={1.8} />
        </div>
      </div>

      <div className="orbit orbit-two" />

      <div className="orbit orbit-three" />

      {/* Earth */}

      <div className="earth">
        <div className="earth-glow" />

        <div className="continent continent-one" />
        <div className="continent continent-two" />
        <div className="continent continent-three" />

        <div className="earth-cloud cloud-one" />
        <div className="earth-cloud cloud-two" />
      </div>

      {/* satellite communication beam */}

      <div className={`signal-beam ${anomaly ? "signal-warning" : ""}`} />

      {/* Anomaly marker */}

      {anomaly && !healed && (
        <div className="anomaly-marker">
          <span className="anomaly-pulse" />
          <div>
            <strong>ANOMALY</strong>
            <small>ATTITUDE DRIFT</small>
          </div>
        </div>
      )}

      {healed && (
        <div className="stable-marker">
          <Radio size={15} />
          TRAJECTORY RESTORED
        </div>
      )}

      <div className="scene-footer">
        <div>
          <span className="legend-dot cyan" />
          CURRENT ORBIT
        </div>

        <div>
          <span className="legend-dot blue" />
          TELEMETRY
        </div>

        <div>
          <span className="legend-dot red" />
          ANOMALY
        </div>
      </div>
    </div>
  );
}
