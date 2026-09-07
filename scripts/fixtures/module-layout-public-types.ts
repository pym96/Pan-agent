/** Compile-only client of the installed package; never a runtime dependency. */
import {
  runCli, runTui, GeneralAgentSession, FauxModelAdapter, RunArchiveStore, loadRunbook,
  type AgentTool, type JsonObject, type ModelAdapter, type CliDependencies,
  type GeneralAgentSessionOptions, type SessionObservation,
} from "pan-agent";
import { runCli as cliRun, type CliConfiguration } from "pan-agent/cli";
import { FauxModelAdapter as SubpathFaux, type FauxScriptEntry } from "pan-agent/faux";

const tool: AgentTool<JsonObject> = {
  name: "typed-probe", description: "compile-only synthetic fixture", parameters: {type: "object"},
  validate: value => ({ok: true, value}),
  execute: async ({toolCallId, arguments: value, signal}) => ({content: [{type: "text", text: `${toolCallId}:${signal.aborted}:${Object.keys(value).length}`}]}),
};
const script: FauxScriptEntry[] = [];
const adapter: ModelAdapter = new FauxModelAdapter(script);
const other: ModelAdapter = new SubpathFaux(script);
const dependencies: CliDependencies = {createNativeAdapter: () => adapter, startTui: options => runTui(options)};
const sameCli: typeof runCli = cliRun;
const sessionFactory: (options: GeneralAgentSessionOptions) => GeneralAgentSession = options => new GeneralAgentSession(options);
const observation: (event: SessionObservation) => string = event => event.type;
const cliConfiguration: (config: CliConfiguration) => CliConfiguration = config => config;
void [tool, other, dependencies, sameCli, sessionFactory, observation, cliConfiguration, RunArchiveStore, loadRunbook];
