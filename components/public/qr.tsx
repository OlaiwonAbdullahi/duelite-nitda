"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders after mount because the value is usually the page's own URL, which
 *  only exists in the browser. */
export default function Qr({ value, size = 136 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toString(value, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#0f0f12", light: "#ffffff" },
    }).then(setSvg);
  }, [value]);

  return (
    <div
      aria-label={`QR code for ${value}`}
      role="img"
      style={{ width: size, height: size }}
      className="[&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
