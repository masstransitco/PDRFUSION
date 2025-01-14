# Pestrian Dead Reckoning Indoor Positioning System - React Web-Based Application

A **Next.js + TypeScript** mobile-centric web application that uses **Three.js** for rendering indoor 3D environments, leverages device motion data for real-time Pedestrian Dead Reckoning (PDR), and offers calibration/test features.

## Features

1. **3D Indoor Modeling**  
   - Renders floor plans or full 3D geometry.  
   - Allows user to select an initial position on the map.

2. **Real-Time Motion Tracking**  
   - Collects accelerometer, gyroscope, (placeholder) magnetometer, and barometric data.  
   - Updates user position on the 3D scene via PDR logic.

3. **Data Capture & Calibration**  
   - Snapshots and continuous data recording for offline analysis.  

4. **Fallback & Testing**  
   - Displays real-time sensor data.  
   - Test page for confirming sensor functionality.

5. **Error Handling & Scalability**  
   - Stubbed for advanced filters like Kalman/Particle to reduce “wall-crossing.”  
   - Scalable for complex multi-floor 3D maps.

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
