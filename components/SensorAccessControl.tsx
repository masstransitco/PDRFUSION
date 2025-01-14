import React, { useState } from "react";
import { useAppDispatch } from "../store";
import { setSensorEnabled } from "../store/sensorSlice";
import { BsToggleOn, BsToggleOff } from "react-icons/bs";

export function SensorAccessControl() {
  const dispatch = useAppDispatch();
  const [isSensorOn, setIsSensorOn] = useState(false);

  const handleToggleSensor = async () => {
    if (!isSensorOn) {
      // Turn ON
      if (
        typeof DeviceMotionEvent !== "undefined" &&
        //@ts-ignore
        typeof DeviceMotionEvent.requestPermission === "function"
      ) {
        try {
          //@ts-ignore
          const result = await DeviceMotionEvent.requestPermission();
          if (result === "granted") {
            setIsSensorOn(true);
            dispatch(setSensorEnabled(true));
          } else {
            alert("Motion sensor permission denied.");
          }
        } catch (error) {
          console.error(error);
          alert("Error requesting motion permissions.");
        }
      } else {
        // Likely Android or older iOS => just enable
        setIsSensorOn(true);
        dispatch(setSensorEnabled(true));
      }
    } else {
      // Turn OFF
      setIsSensorOn(false);
      dispatch(setSensorEnabled(false));
    }
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <h2>Sensor Access</h2>
      <button onClick={handleToggleSensor}>
        {isSensorOn ? <BsToggleOn size={24} /> : <BsToggleOff size={24} />}
        {isSensorOn ? " Turn Sensors Off" : " Turn Sensors On"}
      </button>
    </div>
  );
}
