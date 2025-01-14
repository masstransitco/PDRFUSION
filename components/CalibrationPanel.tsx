import React, { useState } from "react";
import { useAppDispatch } from "../store";
import {
  captureSensorSnapshot,
  startDataRecording,
  stopDataRecording
} from "../store/sensorSlice";
import { FiCamera } from "react-icons/fi";
import { BsCircleFill } from "react-icons/bs";

export function CalibrationPanel() {
  const dispatch = useAppDispatch();
  const [isRecording, setIsRecording] = useState(false);

  const handleSnapshot = () => {
    dispatch(captureSensorSnapshot());
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      dispatch(stopDataRecording());
    } else {
      dispatch(startDataRecording());
    }
    setIsRecording(!isRecording);
  };

  return (
    <div className="calibration-panel">
      <h2>Data Capture & Calibration</h2>
      <button onClick={handleSnapshot}>
        <FiCamera style={{ marginRight: 6 }} />
        Snapshot
      </button>
      <button onClick={handleToggleRecording}>
        <BsCircleFill style={{ marginRight: 6 }} />
        {isRecording ? "Stop Recording" : "Start Recording"}
      </button>
      <p>Capture sensor data for calibration or offline analysis.</p>
    </div>
  );
}
