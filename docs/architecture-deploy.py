# GCP deploy topology for infra/README.md.
# Focuses on the GCP-side wiring Terraform provisions: Artifact Registry
# pushes the image, Cloud Run pulls it, Secret Manager + GCS provide
# runtime data, and the runtime service-account tying access together.

from diagrams import Cluster, Diagram, Edge
from diagrams.gcp.compute import Run
from diagrams.gcp.devtools import ContainerRegistry
from diagrams.gcp.security import Iam, SecretManager
from diagrams.gcp.storage import GCS
from diagrams.onprem.client import User


graph_attrs = {
    "bgcolor": "#0c1014",
    "pad": "0.8",
    "splines": "spline",
    "fontname": "Helvetica",
    "fontcolor": "#e4e4e7",
}
node_attrs = {
    "fontname": "Helvetica",
    "fontcolor": "#e4e4e7",
    "fontsize": "12",
}
edge_attrs = {
    "color": "#52525b",
    "fontname": "Helvetica",
    "fontcolor": "#a1a1aa",
    "fontsize": "10",
}
cluster_attrs = {
    "bgcolor": "#13171c",
    "pencolor": "#27272a",
    "fontname": "Helvetica",
    "fontcolor": "#a1a1aa",
    "fontsize": "11",
    "style": "rounded",
}


with Diagram(
    "Apophasis — GCP deploy",
    filename="/tmp/architecture-deploy",
    show=False,
    direction="LR",
    outformat="png",
    graph_attr=graph_attrs,
    node_attr=node_attrs,
    edge_attr=edge_attrs,
):
    user = User("Visitor\nbrowser")

    with Cluster("project: apophasis · region: us-central1", graph_attr=cluster_attrs):
        ar = ContainerRegistry("Artifact Registry\nlucy-blob/")
        sa = Iam("Runtime SA\nlucy-blob-runtime")

        with Cluster("Cloud Run · lucy-blob", graph_attr=cluster_attrs):
            cr = Run("revision N\n*.run.app HTTPS")

        with Cluster("Secret Manager", graph_attr=cluster_attrs):
            sm = SecretManager(
                "lucy-blob-*-key\n(gemini, brave, tavily,\nexa, serpapi, books,\nplaces, youtube,\nrecaptcha-secret)"
            )

        gcs = GCS("apophasis-\nlucy-blob-logs\nsessions/ · visitors/")

    user >> Edge(label="HTTPS") >> cr
    ar >> Edge(label="image pull\non revision roll") >> cr
    sm >> Edge(label="env via\nsecretKeyRef") >> cr
    cr >> Edge(label="JSONL append") >> gcs
    sa >> Edge(style="dashed", label="secretAccessor") >> sm
    sa >> Edge(style="dashed", label="objectAdmin") >> gcs
    sa >> Edge(style="dashed", label="impersonates") >> cr
