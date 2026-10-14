import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { canDropoffUrl } from "@/lib/grades";
import { Printer } from "lucide-react";

// Printable sign for the side of the dumpster: a big QR code that opens the
// public drop-off form. It lives outside in the rain, so print it large,
// laminate it (matte if possible, to cut glare) and keep the URL printed
// under the code as a fallback.
export default function CansSignPage() {
  const url = canDropoffUrl();
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    // Level H still scans with ~30% of the code damaged: rain spots,
    // scratches or glare on the laminate outside.
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "H" })
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
        <p className="text-xl mt-2 font-semibold">Goal: 100,000 cans by April 30!</p>
        <p className="text-lg mt-1">
          Every can helps bring an <b>ice cream machine</b> to Medina Academy. The more cans we collect, the more
          campuses get one! 🍦
        </p>

        <div
          className="mx-auto my-6 w-72 h-72 print:w-[4in] print:h-[4in] [&>svg]:w-full [&>svg]:h-full"
          data-testid="qr-code"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="text-base font-extrabold tracking-widest text-blue-700">STEPS</p>
        <ol className="text-left text-lg space-y-2 max-w-md mx-auto list-decimal list-inside mt-2">
          <li>Weigh the bag your cans are in.</li>
          <li>Scan the QR code and enter the weight, so we have an estimate.</li>
          <li>Remember, it's an <b>honor system</b>: the count runs on your honesty.</li>
          <li><b>Leave the scale here.</b> Don't hang on it or damage it.</li>
          <li><b>Aluminum cans only.</b> No need to rinse.</li>
        </ol>
        <p className="mt-2 text-sm text-neutral-700">
          A school recycling drive, not a volunteer activity: drop-offs don't count toward volunteer hours.
        </p>

        <p className="mt-6 text-sm text-neutral-600 break-all">{url}</p>
      </div>
    </div>
  );
}
