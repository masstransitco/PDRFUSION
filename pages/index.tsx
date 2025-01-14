// pages/index.tsx

import React, { useCallback } from "react";
import { Layout } from "../components/Layout";
import { ThreeDScene } from "../components/ThreeDScene";
import { SensorDataDisplay } from "../components/SensorDataDisplay";
import { CalibrationPanel } from "../components/CalibrationPanel";
import { SensorAccessControl } from "../components/SensorAccessControl";

import { useAppDispatch, useAppSelector } from "../store";
import {
  setStartingPosition,
  toggleDragMode
  // alignOrientation,  // <-- Removed, no longer used
} from "../store/sensorSlice";

import { useDeviceMotion } from "../hooks/useDeviceMotion";
import { AiOutlineAim } from "react-icons/ai";
import { RiDragDropLine } from "react-icons/ri";
// import { AiOutlineCompass } from "react-icons/ai";  // <-- also removed from usage

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
      <main className="page-container">
        <section className="model-container">
          {/* userPosition from advanced pdr.x/y/z */}
          <ThreeDScene userPosition={{ x: pdr.x, y: pdr.y, z: pdr.z }} />
        </section>

        <section className="controls-container">
          <SensorAccessControl />

          {/* 
            Removed the "Align Orientation" button that previously forced orientationAngle = 0
            If you ever want a custom calibration approach, you can re-add with a different logic. 
          */}

          <button onClick={handleDragToggle}>
            <RiDragDropLine size={20} />
            {dragMode ? "Stop Dragging" : "Enable Drag"}
          </button>

          <button className="set-position-btn" onClick={handleSetPosition}>
            <AiOutlineAim size={24} />
            Set Start Position
          </button>

          <SensorDataDisplay />
          <CalibrationPanel />
        </section>
      </main>
    </Layout>
  );
}
