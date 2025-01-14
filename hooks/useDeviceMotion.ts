// hooks/useDeviceMotion.ts

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../store";
import { updateSensors, updateRealTimePosition } from "../store/sensorSlice";

/**
 * Updated version: 
 * - We remove the ORIENTATION_OFFSET here so that alpha is passed directly.
 * - Any additional heading offset is handled in the PDR logic (updateRealTimePosition).
 */
export function useDeviceMotion() {
  const dispatch = useAppDispatch();
  const { sensorEnabled } = useAppSelector((state) => state.sensor);

  // Keep the last known orientationAngle in a ref so each devicemotion uses it
  const orientationAngleRef = useRef<number>(0);

  useEffect(() => {
    if (!sensorEnabled) return;

    ///////////////////////////
    // 1) DeviceMotion => step detection
    ///////////////////////////
    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      if (event.acceleration) {
        const accel = {
          x: event.acceleration.x ?? 0,
          y: event.acceleration.y ?? 0,
          z: event.acceleration.z ?? 0,
        };

        // Combine with the last known orientationAngle
        dispatch(
          updateSensors({
            acceleration: accel,
            gyroscope: { alpha: 0, beta: 0, gamma: 0 },
            magnetometer: { x: 0, y: 0, z: 0 },
            barometricPressure: 1013.25,
            orientationAngle: orientationAngleRef.current,
          })
        );

        // Trigger the PDR logic (detectSteps => updateRealTimePosition)
        dispatch(updateRealTimePosition());
      }
    };

    ///////////////////////////
    // 2) DeviceOrientation => orientationAngle
    ///////////////////////////
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha != null) {
        // We no longer add +90 here; just pass alpha as-is:
        orientationAngleRef.current = event.alpha;

        // Optionally update Redux so we see heading changes in real-time
        dispatch(
          updateSensors({
            acceleration: { x: 0, y: 0, z: 0 },
            gyroscope: { alpha: 0, beta: 0, gamma: 0 },
            magnetometer: { x: 0, y: 0, z: 0 },
            barometricPressure: 1013.25,
            orientationAngle: event.alpha,
          })
        );
        // If you want orientation alone to update the marker, uncomment:
        // dispatch(updateRealTimePosition());
      }
    };

    // Start listeners
    window.addEventListener("devicemotion", handleDeviceMotion, true);
    window.addEventListener("deviceorientation", handleDeviceOrientation, true);

    // Cleanup on unmount
    return () => {
      window.removeEventListener("devicemotion", handleDeviceMotion, true);
      window.removeEventListener("deviceorientation", handleDeviceOrientation, true);
    };
  }, [sensorEnabled, dispatch]);

  return null;
}
