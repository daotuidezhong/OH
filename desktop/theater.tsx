import React from "react";
import { createRoot } from "react-dom/client";
import { TheaterScene } from "../app/theater/TheaterScene";
import "../app/theater/theater.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><TheaterScene /></React.StrictMode>,
);
