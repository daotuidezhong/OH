import { useLayoutEffect, type RefObject } from "react";
import type { Rect } from "./scene";

export function furnitureCollision(bounds: { left: number; top: number; width: number; height: number }, room: { left: number; top: number; width: number; height: number }, catWidth: number): Rect {
  const ground = bounds.top + bounds.height * .94;
  const padding = catWidth * .18;
  return {
    left: (bounds.left + bounds.width * .09 - padding - room.left) / room.width * 100,
    right: (bounds.left + bounds.width * .91 + padding - room.left) / room.width * 100,
    top: (ground - bounds.height * .23 - catWidth * .06 - room.top) / room.height * 100,
    bottom: (ground + catWidth * .03 - room.top) / room.height * 100,
  };
}

// Read the rendered footpoints so CSS scaling, responsive sizes and moving cats use the same ground plane.
export function useRoomDepth(roomRef: RefObject<HTMLDivElement | null>, walking: boolean) {
  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    let frame = 0;
    const sort = () => {
      const roomBounds = room.getBoundingClientRect();
      const nodes = Array.from(room.querySelectorAll<HTMLElement>("[data-scene-depth]"));
      const grounds = new Map(nodes.map((node) => {
        const bounds = node.getBoundingClientRect();
        const ground = node.classList.contains("jumping") ? roomBounds.top + node.offsetTop + bounds.height * (.94 - .79) : bounds.top + bounds.height * .94;
        return [node, ground];
      }));
      const bowl = nodes.find((node) => node.dataset.sceneDepth === "bowl");
      for (const node of nodes) {
        if (node.dataset.sceneDepth === "rug") { node.style.zIndex = "1"; continue; }
        let ground = grounds.get(node)!;
        const host = node.dataset.onFurniture ? nodes.find((item) => item.dataset.furniture === node.dataset.onFurniture) : undefined;
        if (host) ground = Math.max(ground, grounds.get(host)! + 1);
        // At the bowl, the head reaches over its interior. Sorting the whole cat
        // by its paws would put the entire bowl in front of the lowered face.
        if (bowl && ["LOWER_HEAD", "EATING", "FINISH_EATING"].includes(node.dataset.feedingState ?? "")) {
          ground = Math.max(ground, grounds.get(bowl)! + 1);
        }
        node.style.zIndex = String(Math.round((ground - roomBounds.top) / roomBounds.height * 10000));
      }
      if (walking) frame = requestAnimationFrame(sort);
    };
    sort();
    const resize = new ResizeObserver(() => { if (!walking) sort(); });
    resize.observe(room);
    room.querySelectorAll<HTMLElement>("[data-scene-depth]").forEach((node) => resize.observe(node));
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  });
}
