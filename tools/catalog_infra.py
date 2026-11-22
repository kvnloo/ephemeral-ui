"""Cloud, Kubernetes, IaC and local-ML apps for the infra kinds (src/js/kinds-infra.js).

INFRA_APPS rows: (name, simple-icons slug or None, category, kinds, extra) as in catalog_studio.py.
INFRA_EXTEND: base apps (catalog.py APPS) that also open the infra kinds: name -> (kinds put first, docs).
The cards are authored examples; nothing here implies a live integration with the provider.
"""

D = dict

INFRA_CATEGORIES = {
    "cloud": ("Cloud providers", ["infra-architecture", "infra-iac"]),
    "infra": ("Kubernetes & IaC", ["infra-cluster", "infra-iac"]),
    "localml": ("Local models & training", ["infra-models", "infra-architecture"]),
}

INFRA_APPS = [
    ("AWS", None, "cloud", ["infra-architecture", "infra-iac"], D(docs="https://docs.aws.amazon.com/")),
    ("AWS Lambda", None, "cloud", ["infra-architecture", "infra-iac"], D(docs="https://docs.aws.amazon.com/lambda/")),
    ("Amazon EKS", None, "cloud", ["infra-cluster", "infra-architecture"], D(docs="https://docs.aws.amazon.com/eks/")),
    ("Google Kubernetes Engine", None, "cloud", ["infra-cluster", "infra-architecture"], D(docs="https://cloud.google.com/kubernetes-engine/docs")),
    ("Lambda GPU Cloud", None, "cloud", ["infra-architecture", "infra-models"], D(docs="https://docs.lambda.ai/")),
    ("NVIDIA Brev", None, "cloud", ["infra-architecture", "infra-models"], D(docs="https://docs.nvidia.com/brev/")),
    ("Microsoft Azure", None, "cloud", ["infra-architecture", "infra-iac"], D(docs="https://learn.microsoft.com/azure/")),
    ("Runpod", None, "cloud", ["infra-architecture", "infra-models"], D(docs="https://docs.runpod.io/")),
    ("K3s", None, "infra", ["infra-cluster", "infra-architecture"], D(docs="https://docs.k3s.io/")),
    ("kind", None, "infra", ["infra-cluster", "infra-architecture"], D(docs="https://kind.sigs.k8s.io/")),
    ("OpenTofu", None, "infra", ["infra-iac", "infra-architecture"], D(docs="https://opentofu.org/docs/")),
    ("Pulumi", None, "infra", ["infra-iac", "infra-architecture"], D(docs="https://www.pulumi.com/docs/")),
    ("Helm", None, "infra", ["infra-iac", "infra-cluster"], D(docs="https://helm.sh/docs/")),
    ("Argo CD", None, "infra", ["infra-iac", "infra-cluster"], D(docs="https://argo-cd.readthedocs.io/")),
    ("GGUF", None, "localml", ["infra-models", "infra-architecture"], D(docs="https://github.com/ggml-org/ggml/blob/master/docs/gguf.md")),
    ("Unsloth", None, "localml", ["infra-models", "infra-architecture"], D(docs="https://docs.unsloth.ai/")),
    ("llama.cpp", None, "localml", ["infra-models", "infra-architecture"], D(docs="https://github.com/ggml-org/llama.cpp")),
    ("vLLM", None, "localml", ["infra-models", "infra-architecture"], D(docs="https://docs.vllm.ai/")),
    ("vLLM Semantic Router", None, "localml", ["infra-architecture", "infra-models"], D(docs="https://vllm-semantic-router.com/")),
]

INFRA_EXTEND = {
    "DigitalOcean": (["infra-architecture", "infra-cluster"], "https://docs.digitalocean.com/"),
    "Google Cloud": (["infra-architecture", "infra-cluster"], "https://cloud.google.com/docs"),
    "Kubernetes": (["infra-cluster", "infra-architecture"], "https://kubernetes.io/docs/"),
    "Terraform": (["infra-iac", "infra-architecture"], "https://developer.hashicorp.com/terraform/docs"),
    "Ansible": (["infra-iac", "infra-architecture"], "https://docs.ansible.com/"),
    "Ollama": (["infra-models", "infra-architecture"], "https://docs.ollama.com/"),
}
