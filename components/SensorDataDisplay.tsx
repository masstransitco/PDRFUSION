import React from "react";
import { useAppSelector } from "../store";

export function SensorDataDisplay() {
  const { rawAcceleration, rawGyroscope, rawMagnetometer, barometricPressure } = useAppSelector(
    (state) => state.sensor
  );

  return (
    <div className="sensor-data-display">
      <h2>Real-Time Sensor Data</h2>
      <ul>
        <li>
          <strong>Acceleration:</strong> x: {rawAcceleration.x.toFixed(2)}, y: {rawAcceleration.y.toFixed(2)}, z: {rawAcceleration.z.toFixed(2)}
        </li>
        <li>
          <strong>Gyroscope:</strong> α: {rawGyroscope.alpha.toFixed(2)}, β: {rawGyroscope.beta.toFixed(2)}, γ: {rawGyroscope.gamma.toFixed(2)}
        </li>
        <li>
          <strong>Magnetometer:</strong> x: {rawMagnetometer.x.toFixed(2)}, y: {rawMagnetometer.y.toFixed(2)}, z: {rawMagnetometer.z.toFixed(2)}
        </li>
        <li>
          <strong>Barometric:</strong> {barometricPressure.toFixed(2)} hPa
        </li>
      </ul>
    </div>
  );
}
