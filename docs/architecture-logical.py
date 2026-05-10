# Logical architecture diagram for the main README.
# Captures who-talks-to-whom: browser, the Cloud Run service, Gemini,
# the GCP managed services Lucy depends on, and the upstream APIs the
# server proxy fans out to.

from diagrams import Cluster, Diagram, Edge
from diagrams.gcp.compute import Run
from diagrams.gcp.ml import VertexAI
from diagrams.gcp.security import SecretManager
from diagrams.gcp.storage import GCS
from diagrams.onprem.client import User
from diagrams.programming.framework import React


graph_attrs = {
    "bgcolor": "#0c1014",
    "pad": "0.6",
    "splines": "spline",
    "fontname": "Helvetica",
    "fontcolor": "#e4e4e7",
    "ranksep": "1.0",
    "nodesep": "0.6",
}
node_attrs = {
    "fontname": "Helvetica",
    "fontcolor": "#e4e4e7",
    "fontsize": "12",
}
edge_attrs = {
    "color": "#71717a",
    "fontname": "Helvetica",
    "fontcolor": "#d4d4d8",
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
    "Apophasis — Architecture",
    filename="/tmp/architecture-logical",
    show=False,
    direction="TB",
    outformat="png",
    graph_attr=graph_attrs,
    node_attr=node_attrs,
    edge_attr=edge_attrs,
):
    user = User("Visitor\nbrowser")

    with Cluster("Cloud Run · lucy-blob", graph_attr=cluster_attrs):
        spa = React("Vite SPA\n(dist/)")
        bun = Run("Bun server\n/api/*")
        spa - Edge(style="dotted", color="#52525b") - bun

    with Cluster("GCP managed", graph_attr=cluster_attrs):
        secrets = SecretManager("Secret Manager\n9 keys")
        logs = GCS("GCS\nsessions/ + visitors/")

    with Cluster("Gemini API", graph_attr=cluster_attrs):
        live = VertexAI("Gemini Live\n(WebSocket)")
        gen = VertexAI("Gemini 2.5 Flash\n(drawing vision\n+ surface gen)")

    with Cluster("Upstream APIs", graph_attr=cluster_attrs):
        search = Run("Search providers\nBrave · Tavily · Exa\nSerpApi · Places\nBooks · YouTube")
        geo = Run("Google\nGeocoding")
        recaptcha = Run("reCAPTCHA v3\nsiteverify")

    user >> Edge(label="HTTPS") >> spa
    user >> Edge(label="Live audio (WS)\nephemeral token") >> live
    bun >> Edge(label="env via secretKeyRef") >> secrets
    bun >> Edge(label="JSONL append") >> logs
    bun >> Edge(label="mint token /\ndrawing inference") >> gen
    bun >> Edge(label="proxy / fan-out") >> search
    bun >> Edge(label="reverse geocode") >> geo
    bun >> Edge(label="visitor verify") >> recaptcha
