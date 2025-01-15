// pages/index.tsx

import React, { useCallback } from "react";
import { Layout } from "../components/Layout";
import { ThreeDScene } from "../components/ThreeDScene";

// We no longer import the old SensorDataDisplay, CalibrationPanel, or SensorAccessControl
// import { SensorDataDisplay } from "../components/SensorDataDisplay";
// import { CalibrationPanel } from "../components/CalibrationPanel";
// import { SensorAccessControl } from "../components/SensorAccessControl";

import { useAppDispatch, useAppSelector } from "../store";
import {
  setStartingPosition,
  toggleDragMode
} from "../store/sensorSlice";

import { useDeviceMotion } from "../hooks/useDeviceMotion";
import { AiOutlineAim } from "react-icons/ai";
import { RiDragDropLine } from "react-icons/ri";

// Import the new SensorDashboard
import { SensorDashboard } from "../components/SensorDashboard";

export default function Home() {
  const dispatch = useAppDispatch();
  const { pdr, dragMode } = useAppSelector((state) => state.sensor);

  // Hook that attaches device motion listeners
  useDeviceMotion();

  // Re-center user marker
  const handleSetPosition = useCallback(() => {
    dispatch(setStartingPosition({ x: 0, y: 0, z: 0 }));
  }, [dispatch]);

  // Toggle drag mode
  const handleDragToggle = () => {
    dispatch(toggleDragMode(!dragMode));
  };

  return (
    <Layout>
      <main className="page-container" style={{ display: "flex", gap: "2rem" }}>
        {/* 
          Left side: 3D Scene (with user marker, floor, etc.)
        */}
        <section className="model-container" style={{ flex: 1 }}>
          <ThreeDScene userPosition={{ x: pdr.x, y: pdr.y, z: pdr.z }} />
        </section>

        {/* 
          Right side: Controls & Sensor Dashboard 
        */}
        <section className="controls-container" style={{ flex: "0 0 400px" }}>
          <div style={{ marginBottom: "1rem" }}>
            <button onClick={handleDragToggle} style={{ marginRight: 8 }}>
              <RiDragDropLine size={20} />
              {dragMode ? " Stop Dragging" : " Enable Drag"}
            </button>

            <button className="set-position-btn" onClick={handleSetPosition}>
              <AiOutlineAim size={24} style={{ marginRight: 6 }} />
              Set Start Position
            </button>
          </div>

          {/* Our new combined sensor dashboard */}
          <SensorDashboard />
        </section>
      </main>
    </Layout>
  );
}
