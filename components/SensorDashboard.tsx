import React, { useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "../store";
import {
  setSensorEnabled,
  startDataRecording,
  stopDataRecording,
  captureSensorSnapshot,
} from "../store/sensorSlice";

// Icons
import { BsToggleOn, BsToggleOff, BsCircleFill } from "react-icons/bs";
import { FiCamera } from "react-icons/fi";

// Recharts
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

/**
 * A single consolidated dashboard to:
 *  - Toggle sensor access
 *  - Display live sensor data
 *  - Record & Snapshot data
 *  - Show a Recharts line chart of recent acceleration
 */
export function SensorDashboard() {
  const dispatch = useAppDispatch();

  // Pull sensor data from Redux
  const {
    sensorEnabled,
    rawAcceleration,
    rawGyroscope,
    rawMagnetometer,
    barometricPressure,
    dataSnapshots,
    recording
  } = useAppSelector((state) => state.sensor);

  // Local states for toggles & chart data
  const [isSensorOn, setIsSensorOn] = useState(sensorEnabled);
  const [isRecording, setIsRecording] = useState(recording);

  // We'll store up to 50 points of "live" acceleration for the chart
  const [accelChartData, setAccelChartData] = useState<any[]>([]);

  /**********************************************
   * 1) Sensor Access Toggle
   **********************************************/
  const handleToggleSensor = async () => {
    if (!isSensorOn) {
      // Turn ON
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        //@ts-ignore
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        try {
          //@ts-ignore
          const result = await DeviceMotionEvent.requestPermission();
          if (result === "granted") {
            setIsSensorOn(true);
            dispatch(setSensorEnabled(true));
          } else {
            alert("Motion sensor permission denied.");
          }
        } catch (error) {
          console.error(error);
          alert("Error requesting motion permissions.");
        }
      } else {
        // Likely Android or older iOS => just enable
        setIsSensorOn(true);
        dispatch(setSensorEnabled(true));
      }
    } else {
      // Turn OFF
      setIsSensorOn(false);
      dispatch(setSensorEnabled(false));
    }
  };

  /**********************************************
   * 2) Recording & Snapshot
   **********************************************/
  const handleToggleRecording = () => {
    if (isRecording) {
      dispatch(stopDataRecording());
    } else {
      dispatch(startDataRecording());
    }
    setIsRecording(!isRecording);
  };

  const handleSnapshot = () => {
    dispatch(captureSensorSnapshot());
  };

  // Download current dataSnapshots as JSON
  const handleDownloadSessions = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `Session-${timestamp}.json`;
    const content = JSON.stringify(dataSnapshots, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  };

  /**********************************************
   * 3) Build chart data from rawAcceleration
   **********************************************/
  useEffect(() => {
    // Each time rawAcceleration changes, push a new data point
    const newPoint = {
      time: Date.now(),
      x: rawAcceleration.x,
      y: rawAcceleration.y,
      z: rawAcceleration.z
    };
    setAccelChartData((prev) => [...prev.slice(-49), newPoint]); // keep last 50
  }, [rawAcceleration]);

  // Format data for Recharts: X-axis as "index" or "time"
  // We'll keep it simple and just use the array index for the X-axis
  const chartDisplayData = accelChartData.map((pt, index) => ({
    index,
    ax: pt.x,
    ay: pt.y,
    az: pt.z
  }));

  /**********************************************
   * 4) Render UI
   **********************************************/
  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
      <h2>Live Sensor Dashboard</h2>

      {/* ========== Sensor Access Toggle & Data Recording ========== */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 200 }}>
          <h3>Sensor Access</h3>
          <button onClick={handleToggleSensor} style={{ minWidth: 150 }}>
            {isSensorOn ? <BsToggleOn size={20} /> : <BsToggleOff size={20} />}
            {isSensorOn ? " ON" : " OFF"}
          </button>
        </div>

        <div style={{ minWidth: 200 }}>
          <h3>Data Capture</h3>
          <button onClick={handleSnapshot}>
            <FiCamera style={{ marginRight: 6 }} />
            Snapshot
          </button>
          <button onClick={handleToggleRecording} style={{ marginLeft: 8 }}>
            <BsCircleFill style={{ marginRight: 6 }} />
            {isRecording ? "Stop" : "Start"} Recording
          </button>
          <div style={{ marginTop: 8 }}>
            <button onClick={handleDownloadSessions}>Download Sessions</button>
          </div>
        </div>
      </div>

      {/* ========== Real-Time Sensor Readings ========== */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          gap: "2rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 180 }}>
          <h4>Acceleration (m/s²)</h4>
          <p>X: {rawAcceleration.x.toFixed(2)}</p>
          <p>Y: {rawAcceleration.y.toFixed(2)}</p>
          <p>Z: {rawAcceleration.z.toFixed(2)}</p>
        </div>
        <div style={{ minWidth: 180 }}>
          <h4>Gyroscope (°/s)</h4>
          <p>α: {rawGyroscope.alpha.toFixed(2)}</p>
          <p>β: {rawGyroscope.beta.toFixed(2)}</p>
          <p>γ: {rawGyroscope.gamma.toFixed(2)}</p>
        </div>
        <div style={{ minWidth: 180 }}>
          <h4>Magnetometer (µT)</h4>
          <p>X: {rawMagnetometer.x.toFixed(2)}</p>
          <p>Y: {rawMagnetometer.y.toFixed(2)}</p>
          <p>z: {rawMagnetometer.z.toFixed(2)}</p>
        </div>
        <div style={{ minWidth: 140 }}>
          <h4>Barometric (hPa)</h4>
          <p>{barometricPressure.toFixed(2)}</p>
        </div>
      </div>

      {/* ========== Recharts Visualization ========== */}
      <div style={{ marginTop: 20, width: "100%", height: 300 }}>
        <h3>Acceleration Live Chart</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartDisplayData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="index" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="ax" stroke="#ff7300" name="Ax" />
            <Line type="monotone" dataKey="ay" stroke="#387908" name="Ay" />
            <Line type="monotone" dataKey="az" stroke="#8884d8" name="Az" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
