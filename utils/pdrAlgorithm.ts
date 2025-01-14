/************************************************************
 *  Pedestrian Dead Reckoning (PDR) - No Offset
 *  alpha=0 => arrow faces north => marker moves "north."
 ************************************************************/

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** The core PDR state stored in Redux or a context. */
export interface PDRState {
  x: number; 
  y: number; 
  z: number;

  lastStepTime: number;
  stepCount: number;
  lastAccelMag: number;

  particles: Array<Particle>;
  headingBias: number;
  deviceContext: string; 
  motionState: string;   
}

interface Particle {
  x: number;
  y: number;
  heading: number;
  weight: number;
}

/** 
 * Configuration for the PDR logic,
 * including noise levels, step length ranges, etc.
 */
export interface PDRConfig {
  particleCount: number;      
  headingNoise: number;       
  stepLenNoise: number;       
  resampleThreshold: number;  
  maxHeadingBias: number;
  headingCorrectionGain: number;

  stepLengthWalkRange: [number, number];
  stepLengthRunRange: [number, number];
}

/************************************************************
 * Default PDR config used in sensorSlice.
 ************************************************************/
export const defaultConfig: PDRConfig = {
  particleCount: 150,
  headingNoise: 5,
  stepLenNoise: 0.1,
  resampleThreshold: 75,
  maxHeadingBias: 10,
  headingCorrectionGain: 0.3,
  stepLengthWalkRange: [0.5, 0.7],
  stepLengthRunRange: [0.7, 1.1],
};

/************************************************************
 * 1) Step Detection
 ************************************************************/
export function detectSteps(
  accel: Vector3,
  timeNow: number,
  state: PDRState,
  config?: PDRConfig
): boolean {
  const amag = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);

  // Example threshold
  const dynamicThreshold = 1.2; 
  const dt = timeNow - state.lastStepTime; // seconds

  if (amag > dynamicThreshold && dt > 0.2) {
    state.stepCount += 1;
    state.lastStepTime = timeNow;
    return true;
  }
  return false;
}

/************************************************************
 * 2) Step Length Estimation
 ************************************************************/
export function estimateStepLength(
  stepFrequency: number,
  accelVariance: number,
  motionState: string,
  deviceContext: string
): number {
  const { alpha, beta, gamma } = getCalibrationCoeffs(motionState, deviceContext);
  // Ls = α * freq + β * var + γ
  return alpha * stepFrequency + beta * accelVariance + gamma;
}

function getCalibrationCoeffs(motionState: string, context: string) {
  if (motionState === "walking" && context === "holding") {
    return { alpha: 0.8, beta: 0.1, gamma: 0.35 };
  } else if (motionState === "running" && context === "pocket") {
    return { alpha: 1.1, beta: 0.4, gamma: 0.5 };
  }
  // fallback
  return { alpha: 0.7, beta: 0.2, gamma: 0.3 };
}

/************************************************************
 * 3) Heading Determination
 ************************************************************/
export function computeHeading(
  deviceOrientation: number,
  geolocationHeading: number | null
) {
  // Use deviceOrientation directly; no +90 shift
  let heading = deviceOrientation;

  // Optionally combine with geolocation heading
  if (
    geolocationHeading !== null &&
    !Number.isNaN(geolocationHeading)
  ) {
    heading = 0.7 * heading + 0.3 * geolocationHeading;
  }

  // clamp 0..360
  heading = ((heading % 360) + 360) % 360;

  return heading;
}

/************************************************************
 * 4) Motion Classification
 ************************************************************/
export function classifyMotion(
  accelVariance: number,
  gyroVariance: number
): string {
  if (accelVariance < 0.5 && gyroVariance < 2) {
    return "walking";
  } else if (accelVariance > 0.5 && gyroVariance > 5) {
    return "running";
  } else {
    return "stairs"; 
  }
}

/************************************************************
 * 5) Particle Filter Update
 ************************************************************/
export function particleFilterUpdate(
  state: PDRState,
  stepLength: number,
  headingDeg: number,
  config: PDRConfig
) {
  // 1) Move each particle
  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i];

    const headingNoise = (Math.random() - 0.5) * config.headingNoise;
    const stepLenNoise = (Math.random() - 0.5) * config.stepLenNoise;

    const pHeading = ((headingDeg + headingNoise) % 360 + 360) % 360;
    const step = stepLength + stepLenNoise;

    // Convert pHeading => radians
    const rad = (pHeading * Math.PI) / 180;

    // heading=0 => "north" => p.y += step
    // heading=90 => "east"  => p.x += step
    p.x += step * Math.sin(rad);
    p.y += step * Math.cos(rad);

    // update heading
    p.heading = pHeading;
  }

  // 2) Normalize weights
  const sumW = state.particles.reduce((acc, pt) => acc + pt.weight, 0);
  if (sumW > 0) {
    for (const p of state.particles) {
      p.weight /= sumW;
    }
  }

  // 3) Check effective sample size
  let neff = 0;
  for (const p of state.particles) {
    neff += p.weight * p.weight;
  }
  neff = 1 / neff;

  if (neff < config.resampleThreshold) {
    resampleParticles(state, config);
  }

  // 4) Weighted average => final pdr.x, pdr.y
  let xMean = 0;
  let yMean = 0;
  for (const p of state.particles) {
    xMean += p.x * p.weight;
    yMean += p.y * p.weight;
  }
  state.x = xMean;
  state.y = yMean;
}

function resampleParticles(state: PDRState, config: PDRConfig) {
  const newParticles: Particle[] = [];
  const cdf: number[] = [];
  let sum = 0;
  for (const p of state.particles) {
    sum += p.weight;
    cdf.push(sum);
  }

  const step = sum / config.particleCount;
  let u = Math.random() * step;
  let i = 0;
  for (let j = 0; j < config.particleCount; j++) {
    while (u > cdf[i]) {
      i++;
    }
    const oldP = state.particles[i];
    newParticles.push({
      x: oldP.x,
      y: oldP.y,
      heading: oldP.heading,
      weight: 1 / config.particleCount
    });
    u += step;
  }
  state.particles = newParticles;
}

/************************************************************
 * 6) Error Correction / Post-Processing
 ************************************************************/
export function correctStepLength(
  stepLength: number,
  motionState: string,
  config: PDRConfig
) {
  if (motionState === "walking") {
    return Math.max(
      config.stepLengthWalkRange[0],
      Math.min(stepLength, config.stepLengthWalkRange[1])
    );
  } else if (motionState === "running") {
    return Math.max(
      config.stepLengthRunRange[0],
      Math.min(stepLength, config.stepLengthRunRange[1])
    );
  }
  // fallback
  return stepLength;
}

/**
 * For heading correction we add (headingCorrectionGain * bias).
 */
export function correctHeading(
  headingDeg: number,
  bias: number,
  config: PDRConfig
) {
  const corrected = headingDeg + config.headingCorrectionGain * bias;
  return ((corrected % 360) + 360) % 360;
}
