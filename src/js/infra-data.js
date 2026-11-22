// Authored examples, not discovered infrastructure or provider API responses.
const services = [
  ["client", "Clients", "Edge", "HTTPS entry point"],
  ["aws-api", "API Gateway", "AWS", "Request routing"], ["aws-lambda", "AWS Lambda", "AWS", "Event-driven functions; not Lambda GPU Cloud"],
  ["aws-s3", "S3", "AWS", "Object storage"], ["aws-sqs", "SQS", "AWS", "Async work queue"], ["aws-eks", "EKS", "AWS", "Managed Kubernetes"], ["aws-db", "DynamoDB", "AWS", "Application state"],
  ["gcp-run", "Cloud Run", "GCP", "Container service"], ["gcp-pubsub", "Pub/Sub", "GCP", "Async event transport"], ["gcp-gke", "GKE", "GCP", "Managed Kubernetes"], ["gcp-gcs", "Cloud Storage", "GCP", "Object storage"], ["gcp-sql", "Cloud SQL", "GCP", "Relational database"],
  ["azure", "AKS", "Azure", "Managed Kubernetes"], ["do", "DOKS", "DigitalOcean", "Managed Kubernetes"], ["runpod", "GPU pod", "Runpod", "GPU compute"], ["lambda", "GPU instance", "Lambda GPU Cloud", "GPU compute; not AWS Lambda"], ["brev", "NVIDIA Brev", "NVIDIA", "GPU development environment"],
  ["k3s", "K3s", "Local", "Lightweight Kubernetes"], ["kind", "kind", "Local", "Kubernetes in Docker for development"], ["k8s", "Kubernetes", "Cluster", "Workloads and service discovery"],
  ["ingress", "Ingress", "Cluster", "Cluster entry point"], ["registry", "OCI registry", "Delivery", "Container images; not model weights"], ["terraform", "Terraform", "IaC", "Provisioning and plan review"], ["opentofu", "OpenTofu", "IaC", "Provisioning and plan review"], ["pulumi", "Pulumi", "IaC", "Infrastructure as code"], ["ansible", "Ansible", "IaC", "Host configuration"], ["helm", "Helm", "Delivery", "Kubernetes release packaging"], ["argocd", "Argo CD", "Delivery", "GitOps reconciliation"],
  ["z0int", "z0intelligence", "Local", "Cognition and provider eligibility"], ["kerdoios", "Kerdoios", "Local", "Placement and capacity"], ["router", "vLLM Semantic Router", "Local", "Routing layer; distinct from vLLM inference"],
  ["dataset", "Training dataset", "Local", "Versioned, reviewed training examples"], ["unsloth", "Unsloth", "Local ML", "Fine-tuning and export"], ["adapter", "LoRA adapter", "Artifact", "Merge/export compatibility must be checked"], ["gguf", "GGUF", "Artifact", "Model file format, not a server"], ["llamacpp", "llama.cpp", "Local ML", "GGUF inference runtime"], ["ollama", "Ollama", "Local ML", "Local model runtime"], ["vllm", "vLLM", "Local ML", "Inference server; validate model and format support"], ["comfyui", "ComfyUI", "Local ML", "Image and asset workflows"]
];
export const SERVICES = Object.fromEntries(services.map(([id, label, provider, detail]) => [id, { id, label, provider, detail }]));
const graph = (id, title, nodes, edges, note) => ({ v: 0, id, title, provenance: "authored-example", nodes: nodes.map((service, i) => ({ id: `n${i}`, service })), edges: edges.map(([a, b, label]) => ({ from: `n${a}`, to: `n${b}`, label })), note });
export const ARCHITECTURES = [
  graph("aws", "AWS · event-driven API", ["client", "aws-api", "aws-lambda", "aws-sqs", "aws-db", "aws-s3"], [[0,1,"HTTPS"],[1,2,"invoke"],[2,3,"enqueue"],[2,4,"state"],[2,5,"objects"]], "IAM, retries, dead-letter queues and network policy still need design review."),
  graph("gcp", "GCP · containers + events", ["client", "gcp-run", "gcp-pubsub", "gcp-gke", "gcp-gcs", "gcp-sql"], [[0,1,"HTTPS"],[1,2,"publish"],[2,3,"consume"],[3,4,"artifacts"],[1,5,"query"]], "Service identities and private connectivity are not implied by an arrow."),
  graph("gpu", "GPU cloud · train → local serve", ["dataset", "lambda", "brev", "unsloth", "adapter", "gguf", "llamacpp"], [[0,3,"training data"],[1,3,"compute option"],[2,3,"dev environment option"],[3,4,"train"],[4,5,"merge + export"],[5,6,"load"]], "Lambda GPU Cloud and Brev are alternatives here, not an asserted Brev↔Lambda integration. Check model/export support."),
  graph("hybrid", "Hybrid · AWS + GCP + K3s", ["client", "aws-api", "aws-lambda", "gcp-pubsub", "k3s", "llamacpp", "gcp-gcs"], [[0,1,"HTTPS"],[1,2,"invoke"],[2,3,"authenticated publish"],[3,4,"pull subscriber"],[4,5,"inference"],[4,6,"artifact sync"]], "Cross-cloud identity, egress, residency and failure isolation require explicit review. No tunnel is provisioned."),
  graph("delivery", "IaC · provision → GitOps", ["terraform", "aws-eks", "gcp-gke", "k3s", "kind", "registry", "helm", "argocd"], [[0,1,"provision option"],[0,2,"provision option"],[5,6,"image reference"],[6,7,"chart in Git"],[7,1,"reconcile"],[7,2,"reconcile"],[7,3,"reconcile"],[7,4,"dev rehearsal"]], "Alternative targets, not one shared cluster. K3s/kind bootstrap and credentials are separate host concerns."),
  graph("local", "z0intelligence · local model loop", ["z0int", "kerdoios", "router", "llamacpp", "ollama", "vllm", "comfyui"], [[0,1,"placement request"],[0,2,"eligible route"],[2,3,"GGUF runtime option"],[2,4,"runtime option"],[2,5,"runtime option"],[0,6,"asset workflow"]], "Illustrative composition informed by local project docs; not an inventory, live topology or measured health report.")
];
export function validateGraph(g) {
  if (!g || g.v !== 0 || typeof g.title !== "string" || !g.title.trim() || g.title.length > 160 || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw Error("Expected v:0, title, nodes and edges.");
  if (!g.nodes.length || g.nodes.length > 24 || g.edges.length > 64) throw Error("Use 1–24 nodes and at most 64 edges.");
  const ids = new Set();
  for (const n of g.nodes) {
    if (!n || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(n.id) || ids.has(n.id) || !Object.hasOwn(SERVICES, n.service)) throw Error("Each node needs a unique safe id and a known service.");
    ids.add(n.id);
  }
  for (const e of g.edges) if (!e || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to || typeof e.label !== "string" || !e.label.trim() || e.label.length > 100) throw Error("Edges need existing, different endpoints and a label (1–100 chars).");
  return { v: 0, title: g.title, provenance: "authored-example", nodes: g.nodes.map(n => ({ id: n.id, service: n.service })), edges: g.edges.map(e => ({ from: e.from, to: e.to, label: e.label })) };
}
export const cloneGraph = g => validateGraph(g);
const mermaidText = s => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", " ");
export function toMermaid(input) {
  const g = validateGraph(input), ids = new Map(g.nodes.map((n, i) => [n.id, `node${i}`]));
  return ["flowchart LR", ...g.nodes.map(n => `  ${ids.get(n.id)}["${mermaidText(SERVICES[n.service].provider + ' / ' + SERVICES[n.service].label)}"]`), ...g.edges.map(e => `  ${ids.get(e.from)} -->|"${mermaidText(e.label)}"| ${ids.get(e.to)}`)].join("\n");
}
export const CLUSTERS = {
  k3s: { label: "K3s · local GPU lab", nodes: [["lab-control", "control-plane", "Ready"], ["lab-gpu", "GPU worker", "Ready"]], workloads: [["inference", "llama-server", "1/1", "GPU allocation requires review"], ["training", "unsloth-job", "0/1", "Pending: example GPU contention"]], note: "One example GPU worker. Do not schedule training and serving onto the same device without a capacity policy." },
  kind: { label: "kind · disposable rehearsal", nodes: [["dev-control-plane", "control-plane", "Ready"], ["dev-worker", "worker", "Ready"]], workloads: [["preview", "api", "1/1", "CPU-only rehearsal"], ["preview", "model-stub", "1/1", "Stub; no model inference"]], note: "Runs nodes as containers. GPU passthrough and production parity are not assumed." },
  eks: { label: "EKS · managed Kubernetes", nodes: [["aws-worker-a", "worker", "Ready"], ["aws-worker-b", "worker", "NotReady"]], workloads: [["api", "gateway", "1/2", "Example unavailable replica"], ["jobs", "worker", "2/2", "Example desired state"]], note: "Managed control plane omitted from worker inventory; example only, no AWS API calls." },
  gke: { label: "GKE · managed Kubernetes", nodes: [["gcp-worker-a", "worker", "Ready"], ["gcp-worker-b", "worker", "Ready"]], workloads: [["api", "gateway", "2/2", "Example desired state"], ["events", "subscriber", "1/1", "Example pull subscriber"]], note: "No cluster credentials or live readiness collected." }
};
export const IAC = {
  terraform: { label: "Terraform", command: "terraform show -json <saved-plan>", scope: "Saved-plan review; no apply", rows: [["create", "module.api.aws_lambda_function.api", "Function package"], ["update", "module.storage.aws_s3_bucket.artifacts", "Tags change"], ["replace", "module.cluster.aws_eks_node_group.gpu", "Example immutable property change"]] },
  opentofu: { label: "OpenTofu", command: "tofu show -json <saved-plan>", scope: "Saved-plan review; no apply", rows: [["create", "module.lab.local_file.inventory", "Example inventory artifact"], ["delete", "module.old.aws_s3_bucket.cache", "Destructive: review retention"]] },
  pulumi: { label: "Pulumi", command: "pulumi preview --json", scope: "Preview output; no up", rows: [["create", "kubernetes:apps/v1:Deployment::api", "New deployment"], ["update", "kubernetes:core/v1:Service::api", "Port mapping"]] },
  ansible: { label: "Ansible", command: "ansible-playbook site.yml --check --diff", scope: "Check mode support varies by module", rows: [["update", "lab / configure container runtime", "Predicted host change"], ["update", "lab / configure K3s", "Needs host-specific validation"]] },
  helm: { label: "Helm", command: "helm template demo ./chart", scope: "Local render only; not a cluster dry run", rows: [["render", "Deployment/inference", "Check image digest and GPU requests"], ["render", "Service/inference", "Internal service"]] },
  argocd: { label: "Argo CD", command: "argocd app diff demo", scope: "Diff only; no sync", rows: [["update", "Deployment/api", "Git differs from cluster example"], ["delete", "ConfigMap/obsolete", "Prune requires review"]] }
};
export function planSummary(rows) {
  return { total: rows.length, destructive: rows.filter(([action]) => ["delete", "replace"].includes(action)).length };
}
