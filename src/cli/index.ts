import cac from "cac";
import pc from "picocolors";

const cli = cac("suivant");

cli
  .command("dev", "Start development server")
  .option("--port <port>", "Port number", { default: 3000 })
  .action(async (options: { port: number }) => {
    console.log(pc.cyan("Starting Suivant dev server..."));
    const { startDevServer } = await import("./dev.js");
    await startDevServer({ port: options.port });
  });

cli
  .command("build", "Build for production")
  .action(async () => {
    console.log(pc.cyan("Building Suivant project..."));
    const { build } = await import("./build.js");
    await build();
  });

cli.help();
cli.version("0.1.0");

cli.parse();
