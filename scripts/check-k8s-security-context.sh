#!/usr/bin/env bash
# check-k8s-security-context.sh
#
# Validates that all containers and initContainers in K8s deployment manifests
# have explicit securityContext with runAsUser set.
#
# Prevents regressions where a container runs as root and creates files
# with wrong ownership (e.g. the storage-init permission bug).
#
# Requires: python3 + PyYAML (pip install pyyaml)

set -euo pipefail

MANIFEST_DIR="${1:-infra/k8s/base}"

python3 - "$MANIFEST_DIR" <<'PYTHON'
import sys
import glob
import yaml

manifest_dir = sys.argv[1]
errors = []

for path in sorted(glob.glob(f"{manifest_dir}/*.yaml")):
    with open(path) as f:
        for doc in yaml.safe_load_all(f):
            if not doc or doc.get("kind") not in ("Deployment", "StatefulSet", "DaemonSet", "Job"):
                continue

            name = doc.get("metadata", {}).get("name", "<unnamed>")
            spec = doc.get("spec", {}).get("template", {}).get("spec", {})

            # Check pod-level securityContext
            pod_sc = spec.get("securityContext", {})
            pod_run_as_user = pod_sc.get("runAsUser")

            for container_type in ("initContainers", "containers"):
                for container in spec.get(container_type, []):
                    cname = container.get("name", "<unnamed>")
                    sc = container.get("securityContext", {})

                    # Container must have explicit runAsUser OR inherit from pod-level
                    container_uid = sc.get("runAsUser")
                    effective_uid = container_uid if container_uid is not None else pod_run_as_user

                    if effective_uid is None:
                        errors.append(
                            f"{path}: {name}/{container_type}/{cname} — "
                            f"no runAsUser (neither container nor pod-level)"
                        )
                    elif effective_uid == 0:
                        errors.append(
                            f"{path}: {name}/{container_type}/{cname} — "
                            f"runAsUser is 0 (root)"
                        )

if errors:
    print(f"FAIL: {len(errors)} container(s) missing explicit non-root runAsUser:\n")
    for err in errors:
        print(f"  - {err}")
    sys.exit(1)

print("PASS: All containers have explicit non-root runAsUser.")
PYTHON
