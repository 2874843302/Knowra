import React, { useEffect, useRef, useState } from "react";
import { createIdentityLineField } from "../lib/identity-line-field";

export function IdentityLineField({ enabled, suspended }) {
  const canvas = useRef(null),
    host = useRef(null),
    engine = useRef(null);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    engine.current = createIdentityLineField(canvas.current, host.current, {
      enabled,
      suspended,
    });
    if (!engine.current) setSupported(false);
    return () => {
      engine.current?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setEnabled(enabled);
  }, [enabled]);
  useEffect(() => {
    engine.current?.setSuspended(suspended);
  }, [suspended]);
  return (
    <div
      ref={host}
      className="identity-line-field"
      tabIndex={0}
      role="img"
      aria-label="由流动线条构成的知序书本标志"
    >
      <canvas ref={canvas} aria-hidden="true" />
      {!supported && (
        <p className="identity-line-fallback">
          知序 Knowra
          <br />
          <small>当前浏览器暂不支持线条动效。</small>
        </p>
      )}
    </div>
  );
}
