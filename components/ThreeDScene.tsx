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

// -- Helper function: create a flat floor from shape
function createFloor(shape: THREE.Shape, color = 0xcccccc) {
  const floorGeom = new THREE.ShapeGeometry(shape);
  // DoubleSide so we can see it from below too, if needed
  const floorMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  return new THREE.Mesh(floorGeom, floorMat);
}

// -- Helper function: create extruded walls from shape
function createWalls(
  shape: THREE.Shape,
  height = 3, // in "world units"
  color = 0xffffff,
  opacity = 1
) {
  // depth is how "tall" it will be after rotation
  const extrudeSettings = {
    depth: height,
    bevelEnabled: false,
  };
  const wallGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const wallMat = new THREE.MeshLambertMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });

  const wallMesh = new THREE.Mesh(wallGeom, wallMat);

  // By default, extrude goes along +Z, so rotate to push it up in Y:
  wallMesh.rotation.x = -Math.PI / 2;
  return wallMesh;
}

// -- Helper to create text sprites for cardinal directions
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

export function ThreeDScene({ userPosition }: ThreeDSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const dragControlsRef = useRef<DragControls | null>(null);

  // Pin & Arrow
  const pinGroupRef = useRef<THREE.Group | null>(null);
  const arrowGroupRef = useRef<THREE.Group | null>(null);

  // Floor plan mesh ref (if you want to remove or manipulate it later)
  const floorPlanRef = useRef<THREE.Object3D | null>(null);

  // Trail
  const trailRef = useRef<THREE.Line | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);

  // Redux state
  const { userState, orientationAngle, dragMode } = useAppSelector((state) => state.sensor);
  const dispatch = useAppDispatch();

  const SCALE_FACTOR = 0.05;
  const MAX_TRAIL_POINTS = 100;

  // Whether we’ve already added the floor plan
  const [hasChosenFloorPlan, setHasChosenFloorPlan] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 20, 20);
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

    // Large floor
    const floorGeo = new THREE.PlaneGeometry(50, 50);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Grid + cardinal labels
    const grid = new THREE.GridHelper(50, 50);
    scene.add(grid);

    const labelN = createTextSprite("N", "#fff");
    labelN.position.set(0, 0.1, 25);
    scene.add(labelN);

    const labelE = createTextSprite("E", "#fff");
    labelE.position.set(25, 0.1, 0);
    scene.add(labelE);

    const labelS = createTextSprite("S", "#fff");
    labelS.position.set(0, 0.1, -25);
    scene.add(labelS);

    const labelW = createTextSprite("W", "#fff");
    labelW.position.set(-25, 0.1, 0);
    scene.add(labelW);

    // Pin Group
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);
    pinGroupRef.current = pinGroup;

    // Red sphere + cylinder
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

    // Orbit & Drag controls
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControlsRef.current = orbitControls;

    const dragControls = new DragControls([pinGroup], camera, renderer.domElement);
    dragControlsRef.current = dragControls;

    dragControls.addEventListener("dragstart", () => {
      orbitControls.enabled = false;
    });
    dragControls.addEventListener("drag", (event) => {
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

    // Animate
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [dispatch]);

  // -------------------------------------
  // Handle adding the "502" floor plan
  // -------------------------------------
  const handleChooseFloorPlan = () => {
    if (!sceneRef.current || hasChosenFloorPlan) return;

    // ========== 1) Outer floor shape (perimeter) ==========
    const outerPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(4.74, 0),
      new THREE.Vector2(4.74, 5.09),
      new THREE.Vector2(1.66, 5.09),
      new THREE.Vector2(1.66, 6.75),
      new THREE.Vector2(0, 6.75),
      // ... add more as needed if your shape is more complex
    ];
    const outerShape = new THREE.Shape(outerPoints);

    // ========== (OPTIONAL) 1a) Additional room shape(s) inside the perimeter ==========
    // For example, let's pretend there's a small internal "room" in the corner.
    // These points must be local to the same coordinate system.
    const roomPoints = [
      new THREE.Vector2(1, 1),
      new THREE.Vector2(2, 1),
      new THREE.Vector2(2, 2),
      new THREE.Vector2(1, 2),
    ];
    const roomShape = new THREE.Shape(roomPoints);

    // ========== 2) Create floor (flat) ==========
    const floorMesh = createFloor(outerShape, 0xcccccc);

    // ========== 3) Create outer walls ==========
    // Let's extrude them to 3 meters high and make them partly transparent
    const outerWallMesh = createWalls(outerShape, 3, 0xffffff, 0.7);

    // ========== 4) Create "room" walls inside (optional) ==========
    // If you have multiple separate rooms, repeat for each.
    const roomWallMesh = createWalls(roomShape, 3, 0xffcc99, 0.8);

    // ========== 5) Group them all together ==========
    const floorPlanGroup = new THREE.Group();
    floorPlanGroup.add(floorMesh);
    floorPlanGroup.add(outerWallMesh);
    floorPlanGroup.add(roomWallMesh);

    // ========== 6) Scale 20x bigger than your original scale factor ==========
    const MULTIPLIER = 20;
    floorPlanGroup.scale.set(
      SCALE_FACTOR * MULTIPLIER,
      SCALE_FACTOR * MULTIPLIER,
      SCALE_FACTOR * MULTIPLIER
    );

    // ========== 7) Orient / position the group ==========
    // The floor itself is a ShapeGeometry lying in X/Y, so rotate to match your existing floor plane:
    floorMesh.rotation.x = -Math.PI / 2; // flatten
    floorMesh.position.set(0, 0, 0.0);

    // You might want to raise the group a tiny bit to avoid z-fighting with your large plane:
    floorPlanGroup.position.set(0, 0.01, 0);

    // Add to scene
    sceneRef.current.add(floorPlanGroup);
    floorPlanRef.current = floorPlanGroup;

    setHasChosenFloorPlan(true);
  };

  // -------------------------------------
  //  Update the trail line
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
  // 4) Enable drag only if "selectingStart"
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
