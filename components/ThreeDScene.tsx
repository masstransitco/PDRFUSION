import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { DragControls } from "three/examples/jsm/controls/DragControls";

import { useAppSelector, useAppDispatch } from "../store";
import { setStartingPosition } from "../store/sensorSlice";

interface ThreeDSceneProps {
  userPosition: {
    x: number;
    y: number;
    z: number;
  };
}

// --------------------------------------------------------------------
// 1) Utility to create wall geometry from points
// --------------------------------------------------------------------
const createWallGeometry = (points: number[][], height: number = 0.5) => {
  const shape = new THREE.Shape();

  // Move to first point
  shape.moveTo(points[0][0], points[0][1]);

  // Create lines through all points
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }

  // Close the shape
  shape.lineTo(points[0][0], points[0][1]);

  return new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false
  });
};

// --------------------------------------------------------------------
// 2) Define room coordinates & areas (based on your floor plan)
// --------------------------------------------------------------------
const ROOM_GEOMETRIES = {
  // Main outline
  outline: {
    points: [
      [-2.905, -9.1],
      [2.905, -9.1],
      [2.905, 9.1],
      [-2.905, 9.1],
      [-2.905, -9.1]
    ],
    area: 67
  },

  // Living Room (15 m²)
  livingRoom: {
    points: [
      [-2.37, 0],
      [2.37, 0],
      [2.37, 6.32],
      [-2.37, 6.32]
    ],
    area: 15
  },

  // Bathroom (2.7 m²)
  bathroom: {
    points: [
      [1.66, 5.32],
      [2.37, 5.32],
      [2.37, 6.32],
      [1.66, 6.32]
    ],
    area: 2.7
  },

  // Other 1 (21 m²)
  other1: {
    points: [
      [-2.37, -8.85],
      [2.37, -8.85],
      [2.37, -4.5],
      [-2.37, -4.5]
    ],
    area: 21
  },

  // Other 2 (12 m²)
  other2: {
    points: [
      [1.94, -4.5],
      [2.905, -4.5],
      [2.905, 1.75],
      [1.94, 1.75]
    ],
    area: 12
  },

  // Other 3 (5.2 m²)
  other3: {
    points: [
      [-2.905, 7.75],
      [-0.765, 7.75],
      [-0.765, 9.1],
      [-2.905, 9.1]
    ],
    area: 5.2
  },

  // Other 4 (1.8 m²)
  other4: {
    points: [
      [0.85, 6.32],
      [1.66, 6.32],
      [1.66, 7.4],
      [0.85, 7.4]
    ],
    area: 1.8
  },

  // Other 5 (1.4 m²)
  other5: {
    points: [
      [-0.14, 6.32],
      [0.85, 6.32],
      [0.85, 7.4],
      [-0.14, 7.4]
    ],
    area: 1.4
  }
};

// --------------------------------------------------------------------
// 3) Create a Three.Group of all floor plan geometries
// --------------------------------------------------------------------
const createFloorPlanGeometries = () => {
  const geometries = new THREE.Group();

  // Materials (adjust colors as desired)
  const floorMaterial = new THREE.MeshLambertMaterial({
    color: 0x444444,
    side: THREE.DoubleSide
  });
  const bathroomMaterial = new THREE.MeshLambertMaterial({
    color: 0x555555,
    side: THREE.DoubleSide
  });

  // Build a mesh for each entry in ROOM_GEOMETRIES
  Object.entries(ROOM_GEOMETRIES).forEach(([roomName, data]) => {
    const geometry = createWallGeometry(data.points);
    // If it's the bathroom, use a different material
    const material = roomName === "bathroom" ? bathroomMaterial : floorMaterial;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      name: roomName,
      area: data.area
    };
    geometries.add(mesh);
  });

  return geometries;
};

// --------------------------------------------------------------------
// 4) Integrate the floor plan into the scene
// --------------------------------------------------------------------
const integrateFloorPlan = (scene: THREE.Scene) => {
  const floorPlan = createFloorPlanGeometries();

  // Slight offset above 0 to avoid z-fighting
  floorPlan.position.y = 0.01;

  scene.add(floorPlan);

  // Optional: Add a semi-transparent ground plane under it
  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshLambertMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.5
    })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.01;
  scene.add(groundPlane);

  return floorPlan;
};

// --------------------------------------------------------------------
// 5) ThreeDScene Component
// --------------------------------------------------------------------
export function ThreeDScene({ userPosition }: ThreeDSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const dragControlsRef = useRef<DragControls | null>(null);

  // Pin group (selectingStart) & Arrow group (startPointSelected)
  const pinGroupRef = useRef<THREE.Group | null>(null);
  const arrowGroupRef = useRef<THREE.Group | null>(null);

  // Trail
  const trailRef = useRef<THREE.Line | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);

  // Redux states
  const { userState, orientationAngle, dragMode } = useAppSelector((state) => state.sensor);
  const dispatch = useAppDispatch();

  // Scale factor for converting real-world meters to Three.js
  const SCALE_FACTOR = 0.05;
  const MAX_TRAIL_POINTS = 100;

  // Track if we’ve added the floor plan yet
  const [hasChosenFloorPlan, setHasChosenFloorPlan] = useState(false);

  // -------------------------------------
  // Initial scene setup
  // -------------------------------------
  useEffect(() => {
    if (!mountRef.current) return;

    // 1) Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // 2) Create camera
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    // Position camera somewhat above and looking down
    camera.position.set(0, 15, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3) Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4) Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 5) Orbit controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.minDistance = 5;
    orbitControls.maxDistance = 20;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.1;
    orbitControlsRef.current = orbitControls;

    // 6) Create pin group
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);
    pinGroupRef.current = pinGroup;

    // Red sphere + cylinder “pin”
    const pinSphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const pinSphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const pinSphere = new THREE.Mesh(pinSphereGeo, pinSphereMat);
    pinSphere.position.set(0, 0.5, 0);
    pinGroup.add(pinSphere);

    const pinGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.set(0, 0, 0);
    pinGroup.add(pinMesh);

    // 7) Arrow group
    const arrowGroup = new THREE.Group();
    scene.add(arrowGroup);
    arrowGroupRef.current = arrowGroup;

    const arrowGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(0, 0.5, 0);
    arrowMesh.rotation.x = Math.PI / 2;
    arrowGroup.add(arrowMesh);

    // 8) Trail line
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const trailGeometry = new THREE.BufferGeometry();
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    scene.add(trailLine);
    trailRef.current = trailLine;

    // 9) Drag controls for the pin
    const dragControls = new DragControls([pinGroup], camera, renderer.domElement);
    dragControlsRef.current = dragControls;

    dragControls.addEventListener("dragstart", () => {
      orbitControls.enabled = false;
    });
    dragControls.addEventListener("drag", (event) => {
      // Keep pin on floor
      event.object.position.y = 0;
    });
    dragControls.addEventListener("dragend", (event) => {
      orbitControls.enabled = true;
      const { x, z } = event.object.position;
      const realX = x / SCALE_FACTOR;
      const realY = z / SCALE_FACTOR;
      dispatch(setStartingPosition({ x: realX, y: realY, z: 0 }));
    });
    dragControls.enabled = false;

    // 10) Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup on unmount
    return () => {
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [dispatch]);

  // -------------------------------------
  // Button click => integrate the floor plan
  // -------------------------------------
  const handleChooseFloorPlan = () => {
    if (!sceneRef.current || hasChosenFloorPlan) return;

    integrateFloorPlan(sceneRef.current);

    setHasChosenFloorPlan(true);
  };

  // -------------------------------------
  // Update the trail line (user movement)
  // -------------------------------------
  const updateTrail = (pos: THREE.Vector3) => {
    trailPointsRef.current.push(new THREE.Vector3(pos.x, 0.1, pos.z));
    if (trailPointsRef.current.length > MAX_TRAIL_POINTS) {
      trailPointsRef.current.shift();
    }
    if (trailRef.current) {
      const geometry = new THREE.BufferGeometry().setFromPoints(trailPointsRef.current);
      trailRef.current.geometry.dispose();
      trailRef.current.geometry = geometry;
    }
  };

  // -------------------------------------
  // 1) Show/hide pin & arrow
  // -------------------------------------
  useEffect(() => {
    if (!pinGroupRef.current || !arrowGroupRef.current) return;

    if (userState === "selectingStart") {
      // Show pin; hide arrow
      pinGroupRef.current.visible = true;
      arrowGroupRef.current.visible = false;

      // Clear trail
      trailPointsRef.current = [];
      if (trailRef.current) {
        trailRef.current.geometry.dispose();
        trailRef.current.geometry = new THREE.BufferGeometry();
      }
      pinGroupRef.current.position.set(0, 0, 0);
    } else {
      // "startPointSelected"
      pinGroupRef.current.visible = false;
      arrowGroupRef.current.visible = true;
    }
  }, [userState]);

  // -------------------------------------
  // 2) Position arrow from userPosition
  // -------------------------------------
  useEffect(() => {
    if (!arrowGroupRef.current) return;
    if (userState === "startPointSelected") {
      const arrowPos = new THREE.Vector3(
        userPosition.x * SCALE_FACTOR,
        0,
        userPosition.y * SCALE_FACTOR
      );
      arrowGroupRef.current.position.copy(arrowPos);

      updateTrail(arrowPos);
    }
  }, [userPosition, userState]);

  // -------------------------------------
  // 3) Rotate arrow for heading
  // -------------------------------------
  useEffect(() => {
    if (!arrowGroupRef.current) return;
    if (userState === "startPointSelected") {
      const headingRad = THREE.MathUtils.degToRad(orientationAngle);
      arrowGroupRef.current.rotation.y = headingRad;
    }
  }, [orientationAngle, userState]);

  // -------------------------------------
  // 4) Drag => only if "selectingStart"
  // -------------------------------------
  useEffect(() => {
    if (!dragControlsRef.current) return;
    dragControlsRef.current.enabled = userState === "selectingStart" && dragMode;
  }, [dragMode, userState]);

  // -------------------------------------
  // Render
  // -------------------------------------
  return (
    <div style={{ position: "relative" }}>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "60vh",
          margin: "0 auto",
          overflow: "hidden"
        }}
      />
      <button
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 10,
          padding: "8px 12px"
        }}
        onClick={handleChooseFloorPlan}
      >
        Show Floor Plan (Unit 502)
      </button>
    </div>
  );
}
