import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  detectSteps,
  estimateStepLength,
  computeHeading,
  classifyMotion,
  particleFilterUpdate,
  correctStepLength,
  correctHeading,
  defaultConfig,
  PDRState
} from "../utils/pdrAlgorithm";

//////////////////////////////////////////////////////////////////////////////
// 1) Additional Types
//////////////////////////////////////////////////////////////////////////////

type UserState = "selectingStart" | "startPointSelected";

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface GyroData {
  alpha: number;
  beta: number;
  gamma: number;
}

interface SensorSnapshot {
  timestamp: number;
  acceleration: Vector3;
  gyroscope: GyroData;
  magnetometer: Vector3;
  barometricPressure: number;
  position: { x: number; y: number; z: number };
}

/** 
 * Redux state that includes advanced PDR data and our new `userState`.
 */
interface SensorState {
  userState: UserState;
  sensorEnabled: boolean;
  dragMode: boolean;
  orientationAngle: number;

  rawAcceleration: Vector3;
  rawGyroscope: GyroData;
  rawMagnetometer: Vector3;
  barometricPressure: number;

  dataSnapshots: SensorSnapshot[];
  recording: boolean;

  pdr: PDRState;
}

//////////////////////////////////////////////////////////////////////////////
// 2) Create the initial advanced PDR substate
//////////////////////////////////////////////////////////////////////////////

const initialPDR: PDRState = {
  x: 0,
  y: 0,
  z: 0,
  lastStepTime: 0,
  stepCount: 0,
  lastAccelMag: 0,

  headingBias: 0,
  deviceContext: "holding",
  motionState: "walking",
  particles: Array(150)
    .fill(0)
    .map(() => ({
      x: 0,
      y: 0,
      heading: 0,
      weight: 1 / 150
    }))
};

//////////////////////////////////////////////////////////////////////////////
// 3) Main initial state
//////////////////////////////////////////////////////////////////////////////

const initialState: SensorState = {
  userState: "selectingStart",
  sensorEnabled: false,
  dragMode: false,
  orientationAngle: 0,

  rawAcceleration: { x: 0, y: 0, z: 0 },
  rawGyroscope: { alpha: 0, beta: 0, gamma: 0 },
  rawMagnetometer: { x: 0, y: 0, z: 0 },
  barometricPressure: 1013.25,

  dataSnapshots: [],
  recording: false,
  pdr: initialPDR
};

//////////////////////////////////////////////////////////////////////////////
// 4) The slice
//////////////////////////////////////////////////////////////////////////////

export const sensorSlice = createSlice({
  name: "sensor",
  initialState,
  reducers: {
    setSensorEnabled: (state, action: PayloadAction<boolean>) => {
      state.sensorEnabled = action.payload;
      if (action.payload) {
        state.userState = "startPointSelected";
      } else {
        state.userState = "selectingStart";
      }
    },

    setUserState: (state, action: PayloadAction<UserState>) => {
      state.userState = action.payload;
      if (action.payload === "startPointSelected") {
        state.sensorEnabled = true;
      } else {
        state.sensorEnabled = false;
      }
    },

    toggleDragMode: (state, action: PayloadAction<boolean>) => {
      state.dragMode = action.payload;
    },

    alignOrientation: (state, action: PayloadAction<number>) => {
      state.orientationAngle = action.payload;
    },

    setStartingPosition: (
      state,
      action: PayloadAction<{ x: number; y: number; z: number }>
    ) => {
      state.pdr.x = action.payload.x;
      state.pdr.y = action.payload.y;
      state.pdr.z = action.payload.z;
    },

    updateSensors: (
      state,
      action: PayloadAction<{
        acceleration: Vector3;
        gyroscope: GyroData;
        magnetometer: Vector3;
        barometricPressure: number;
        orientationAngle?: number;
      }>
    ) => {
      const {
        acceleration,
        gyroscope,
        magnetometer,
        barometricPressure,
        orientationAngle
      } = action.payload;

      state.rawAcceleration = acceleration;
      state.rawGyroscope = gyroscope;
      state.rawMagnetometer = magnetometer;
      state.barometricPressure = barometricPressure;

      if (orientationAngle !== undefined) {
        state.orientationAngle = orientationAngle;
      }
    },

    updateRealTimePosition: (state) => {
      // Skip PDR if user is selecting start
      if (state.userState === "selectingStart") {
        return;
      }

      const nowSec = Date.now() / 1000.0;
      const accel = state.rawAcceleration;

      // 1) Step detection
      const stepDetected = detectSteps(accel, nowSec, state.pdr);
      if (stepDetected) {
        const dt = nowSec - state.pdr.lastStepTime;
        const stepFreq = dt > 0 ? 1 / dt : 1;
        const accelVar = 0.3; 
        const gyroVar = 2.0;

        // 2) Classify motion
        const motion = classifyMotion(accelVar, gyroVar);
        state.pdr.motionState = motion;

        // 3) Step length => multiply if you want "1 step => 1 grid cell"
        let Ls = estimateStepLength(stepFreq, accelVar, motion, state.pdr.deviceContext);
        Ls = correctStepLength(Ls, motion, defaultConfig);
        Ls = Ls * 5; // e.g., x5 to make 1 step = 1 grid cell

        // 4) Use orientationAngle directly: no +90 shift
        let headingDeg = computeHeading(state.orientationAngle, null);

        headingDeg = correctHeading(headingDeg, state.pdr.headingBias, defaultConfig);

        // 5) Particle Filter => final pdr.x, pdr.y
        particleFilterUpdate(state.pdr, Ls, headingDeg, defaultConfig);
      }

      // Store last acceleration magnitude
      const { x: ax, y: ay, z: az } = accel;
      state.pdr.lastAccelMag = Math.sqrt(ax * ax + ay * ay + az * az);
    },

    captureSensorSnapshot: (state) => {
      const snapshot: SensorSnapshot = {
        timestamp: Date.now(),
        acceleration: { ...state.rawAcceleration },
        gyroscope: { ...state.rawGyroscope },
        magnetometer: { ...state.rawMagnetometer },
        barometricPressure: state.barometricPressure,
        position: { x: state.pdr.x, y: state.pdr.y, z: state.pdr.z }
      };
      state.dataSnapshots.push(snapshot);
    },

    startDataRecording: (state) => {
      state.recording = true;
    },

    stopDataRecording: (state) => {
      state.recording = false;
    }
  }
});

export const {
  setSensorEnabled,
  setUserState,
  toggleDragMode,
  alignOrientation,
  setStartingPosition,
  updateSensors,
  updateRealTimePosition,
  captureSensorSnapshot,
  startDataRecording,
  stopDataRecording
} = sensorSlice.actions;

export default sensorSlice.reducer;
