/** Keep the app inside the usable phone viewport, including the on-screen keyboard. */
export function installMobileViewport(): () => void {
  const root = document.documentElement;
  const mobile = matchMedia("(pointer: coarse), (max-width: 900px)");
  const viewport = window.visualViewport;
  const heldPointers = new Set<number>();
  let frame = 0;
  let lastHeight = window.innerHeight;
  let disposed = false;

  const gameSurface = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest("#world, .touch-controls, #skill-button");

  function update() {
    frame = 0;
    if (disposed) return;
    if (!mobile.matches) {
      delete root.dataset.mobileViewport;
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset-top");
      heldPointers.clear();
      return;
    }
    root.dataset.mobileViewport = "true";

    // A deliberate pinch zoom changes visualViewport.height too. Preserve the
    // layout during zoom so text can be magnified without continually reflowing it.
    const zoomed = viewport && Math.abs(viewport.scale - 1) > 0.01;
    if (!zoomed) lastHeight = viewport?.height || window.innerHeight;
    root.style.setProperty("--app-height", `${lastHeight}px`);
    root.style.setProperty(
      "--app-offset-top",
      `${zoomed ? 0 : (viewport?.offsetTop ?? 0)}px`,
    );

    // Safari may pan the layout viewport to focus a field. Only the dialog should
    // scroll; it is sized again above when the keyboard/address bar changes.
    if (!zoomed && window.scrollY !== 0) window.scrollTo(0, 0);
    const focused = document.activeElement;
    if (
      !zoomed &&
      focused instanceof HTMLElement &&
      focused.matches("input, textarea, select, [contenteditable='true']")
    ) {
      const dialog = focused.closest<HTMLElement>(".dialog");
      if (dialog) {
        const fieldBox = focused.getBoundingClientRect();
        const dialogBox = dialog.getBoundingClientRect();
        if (fieldBox.bottom > dialogBox.bottom - 12)
          dialog.scrollTop += fieldBox.bottom - dialogBox.bottom + 12;
        else if (fieldBox.top < dialogBox.top + 12)
          dialog.scrollTop -= dialogBox.top + 12 - fieldBox.top;
      }
    }
  }

  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(update);
  }
  function capture(event: PointerEvent) {
    if (
      mobile.matches &&
      event.pointerType !== "mouse" &&
      gameSurface(event.target)
    )
      heldPointers.add(event.pointerId);
  }
  function release(event: PointerEvent) {
    heldPointers.delete(event.pointerId);
  }
  function preventGameGesture(event: Event) {
    if (
      mobile.matches &&
      event.cancelable &&
      (heldPointers.size > 0 || gameSurface(event.target))
    )
      event.preventDefault();
  }
  function clearPointers() {
    heldPointers.clear();
  }

  // CSS touch-action handles current browsers; the non-passive gesture listener
  // also covers Safari gesture events and touches moving beyond a captured key.
  document.addEventListener("gotpointercapture", capture);
  document.addEventListener("lostpointercapture", release);
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  window.addEventListener("blur", clearPointers);
  document.addEventListener("touchmove", preventGameGesture, {
    passive: false,
  });
  document.addEventListener("gesturestart", preventGameGesture, {
    passive: false,
  });
  document.addEventListener("gesturechange", preventGameGesture, {
    passive: false,
  });
  document.addEventListener("dblclick", preventGameGesture);
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  mobile.addEventListener("change", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  update();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    document.removeEventListener("gotpointercapture", capture);
    document.removeEventListener("lostpointercapture", release);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
    window.removeEventListener("blur", clearPointers);
    document.removeEventListener("touchmove", preventGameGesture);
    document.removeEventListener("gesturestart", preventGameGesture);
    document.removeEventListener("gesturechange", preventGameGesture);
    document.removeEventListener("dblclick", preventGameGesture);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", schedule);
    mobile.removeEventListener("change", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    delete root.dataset.mobileViewport;
    root.style.removeProperty("--app-height");
    root.style.removeProperty("--app-offset-top");
  };
}
