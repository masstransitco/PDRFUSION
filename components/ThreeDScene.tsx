import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { DragControls } from "three/examples/jsm/controls/DragControls";

import { useAppSelector, useAppDispatch } from "../store";
import { setStartingPosition } from "../store/sensorSlice";

interface ThreeDSceneProps {
  userPosition: {
    x: number; // e.g. east-west in PDR
    y: number; // e.g. north-south in PDR
    z: number; // optional altitude
  };
}

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

  // Floor plan group ref (so we can manipulate or remove later if needed)
  const floorPlanGroupRef = useRef<THREE.Group | null>(null);

  // Trail
  const trailRef = useRef<THREE.Line | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);

  // Redux states
  const { userState, orientationAngle, dragMode } = useAppSelector((state) => state.sensor);
  const dispatch = useAppDispatch();

  // Constants
  const SCALE_FACTOR = 0.05;      // used to convert from "real-world meters" to Three.js coords
  const MAX_TRAIL_POINTS = 100;

  // Track if we’ve added the floor plan yet
  const [hasChosenFloorPlan, setHasChosenFloorPlan] = useState(false);

  // -------------------------------------
  // Initial scene setup
  // -------------------------------------
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera (Perspective)
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    // Position camera somewhat above and looking down
    camera.position.set(0, 40, 40);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Large “ground” plane for reference
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Grid + cardinal labels
    const grid = new THREE.GridHelper(100, 50);
    scene.add(grid);

    const labelN = createTextSprite("N", "#fff");
    labelN.position.set(0, 0.1, 50);
    scene.add(labelN);

    const labelE = createTextSprite("E", "#fff");
    labelE.position.set(50, 0.1, 0);
    scene.add(labelE);

    const labelS = createTextSprite("S", "#fff");
    labelS.position.set(0, 0.1, -50);
    scene.add(labelS);

    const labelW = createTextSprite("W", "#fff");
    labelW.position.set(-50, 0.1, 0);
    scene.add(labelW);

    // Pin Group
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);
    pinGroupRef.current = pinGroup;

    // Red sphere + cylinder for the “pin”
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

    // Arrow Group
    const arrowGroup = new THREE.Group();
    scene.add(arrowGroup);
    arrowGroupRef.current = arrowGroup;

    const arrowGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(0, 0.5, 0);
    arrowMesh.rotation.x = Math.PI / 2;
    arrowGroup.add(arrowMesh);

    // Trail line
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const trailGeometry = new THREE.BufferGeometry();
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    scene.add(trailLine);
    trailRef.current = trailLine;

    // Orbit controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControlsRef.current = orbitControls;

    // Drag controls (for the pin)
    const dragControls = new DragControls([pinGroup], camera, renderer.domElement);
    dragControlsRef.current = dragControls;

    dragControls.addEventListener("dragstart", () => {
      orbitControls.enabled = false;
    });
    dragControls.addEventListener("drag", (event) => {
      // Keep pin on the floor
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

    // Animation loop
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
  // Handle adding the "502" floor plan in 3D
  // -------------------------------------
  const handleChooseFloorPlan = () => {
    if (!sceneRef.current || hasChosenFloorPlan) return;

    // This group will hold our floor + walls, so we can manipulate them as one
    const floorPlanGroup = new THREE.Group();

    // ===== 1) Actual shape of the perimeter (approx. from the 2nd image) =====
    // NOTE: These coordinates are an *example approximation* to demonstrate.
    //       Adjust them to match your real measurements more precisely.
    const shapePoints = [
      new THREE.Vector2(0, 0),       // Start bottom-left
      new THREE.Vector2(4.74, 0),    // Move right ~4.74m
      new THREE.Vector2(4.74, 5.90), // Move up ~5.90m
      // Small extension to the right (the "bathroom" area):
      new THREE.Vector2(6.40, 5.90), // ~1.66m extension
      new THREE.Vector2(6.40, 7.56), // Up ~1.66
      // Move back left toward living room top corner:
      new THREE.Vector2(4.74, 7.56),
      new THREE.Vector2(4.74, 8.56), // ~1 more meter up
      // Then all the way left
      new THREE.Vector2(0, 8.56),
      // and close shape back to (0,0):
    ];

    const outerShape = new THREE.Shape(shapePoints);

    // ===== 2) Floor geometry (flat) =====
    const floorGeom = new THREE.ShapeGeometry(outerShape);
    const floorMat = new THREE.MeshLambertMaterial({
      color: 0xaaaaaa, // light gray
      side: THREE.DoubleSide,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    // Rotate so shape lies in the XZ-plane:
    floorMesh.rotation.x = -Math.PI / 2;
    floorPlanGroup.add(floorMesh);

    // ===== 3) Extruded “walls” around perimeter (optional) =====
    // If you want actual vertical walls, extrude the shape:
    const extrudeSettings = {
      depth: 3, // ~3 meters tall
      bevelEnabled: false,
    };
    const wallGeom = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);
    const wallMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5, // half-transparent walls
    });
    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    // By default, extrude goes along +Z axis, so rotate -90° to stand it up
    wallMesh.rotation.x = -Math.PI / 2;
    floorPlanGroup.add(wallMesh);

    // ===== (Optional) interior shapes/rooms, if needed =====
    // For example, a small approximate interior partition:
    // const interiorRoomPoints = [
    //   new THREE.Vector2(1, 1),
    //   new THREE.Vector2(2, 1),
    //   new THREE.Vector2(2, 2),
    //   new THREE.Vector2(1, 2),
    // ];
    // // You could build a shape, extrude it, etc.

    // ===== 4) Scale up or down to match your scene =====
    // If your real measurements are in meters and you want to fit them to your scene,
    // combine your SCALE_FACTOR with an optional multiplier:
    const MULTIPLIER = 20; // or whatever scaling suits your scene
    floorPlanGroup.scale.set(
      SCALE_FACTOR * MULTIPLIER,
      SCALE_FACTOR * MULTIPLIER,
      SCALE_FACTOR * MULTIPLIER
    );

    // Lift the group slightly so it’s not z-fighting with the big plane
    floorPlanGroup.position.set(0, 0.01, 0);

    // Add the group to the scene
    sceneRef.current.add(floorPlanGroup);
    floorPlanGroupRef.current = floorPlanGroup;

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
      // Show the pin; hide arrow
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
        Choose Scene: 502, 5/F. New Landwide Commercial Building
      </button>
    </div>
  );
}

/**
 * Utility to create a simple text sprite (e.g., for cardinal directions)
 */
function createTextSprite(text: string, color: string) {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2, 2, 1);
  return sprite;
}
