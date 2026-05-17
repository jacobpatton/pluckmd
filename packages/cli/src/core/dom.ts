import { JSDOM, VirtualConsole } from "jsdom";

type DomOptions = ConstructorParameters<typeof JSDOM>[1];

export function createDom(html: string, options: DomOptions = {}): JSDOM {
  return new JSDOM(html, {
    ...options,
    virtualConsole: options.virtualConsole ?? createQuietVirtualConsole(),
  });
}

function createQuietVirtualConsole(): VirtualConsole {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error: Error & { type?: string }) => {
    if (
      error.type === "css parsing" ||
      error.message.includes("Could not parse CSS stylesheet")
    ) {
      return;
    }

    console.error(error);
  });
  return virtualConsole;
}
