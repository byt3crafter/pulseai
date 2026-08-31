import { routeModel } from "./src/agent/runtime.ts";
import { getModelById } from "./src/agent/providers/model-registry.ts";
const opts = { hasTools: true, hasAttachments: false, capableModel: "gpt-5.5", fastModel: "MiniMax-M3" };
for (const msg of ["hi", "thanks", "what's the invoice total for Tanelec?", "list my contacts", "ok"]) {
  const d = routeModel(msg, opts);
  console.log(`${JSON.stringify(msg).padEnd(45)} -> ${d.modelId}  (${d.reason})`);
}
console.log("\nMiniMax-M3 resolves in registry:", !!getModelById("MiniMax-M3"));
console.log("hasTools=true forces capable? ", routeModel("hi", {...opts, hasTools:true}).modelId);
console.log("hasTools=false, 'hi' ->        ", routeModel("hi", {...opts, hasTools:false}).modelId);
