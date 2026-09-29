import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { canDropoffUrl } from "@/lib/grades";
import { Printer } from "lucide-react";

// Printable sign for the dumpster: a big QR code that opens the public
// drop-off form. Print it, laminate it (it lives outside), tape it on.
export default function CansSignPage() {
  const url = canDropoffUrl();
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center px-6 py-10">
      <div className="print:hidden mb-6">
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" /> Print sign
        </Button>
      </div>

      <div className="w-full max-w-xl text-center border-4 border-green-700 rounded-3xl p-8">
        <p className="text-5xl">🥫♻️</p>
        <h1 className="text-4xl font-extrabold mt-3 text-green-800">Million Cans Challenge</h1>
        <p className="text-xl mt-2 font-semibold">Help us reach 100,000 cans!</p>

        <div
          className="mx-auto my-6 w-72 h-72 [&>svg]:w-full [&>svg]:h-full"
          data-testid="qr-code"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <ol className="text-left text-lg space-y-2 max-w-sm mx-auto list-decimal list-inside">
          <li>Weigh your bag of cans on the scale.</li>
          <li>Scan this code with your phone camera.</li>
          <li>Enter the weight and your grade.</li>
          <li>Toss the bag in the dumpster!</li>
        </ol>

        <p className="mt-6 text-sm text-neutral-600 break-all">{url}</p>
      </div>
    </div>
  );
}
