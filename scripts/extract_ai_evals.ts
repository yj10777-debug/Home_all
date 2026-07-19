import { prisma } from "../src/lib/prisma";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const evals = await prisma.aiEvaluation.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  
  const outputPath = path.join(process.cwd(), "ai_evals_output.json");
  fs.writeFileSync(outputPath, JSON.stringify(evals, null, 2), "utf-8");
  console.log(`Exported ${evals.length} evaluations to ${outputPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
