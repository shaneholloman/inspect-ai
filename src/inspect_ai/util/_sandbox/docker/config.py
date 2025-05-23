import os
from logging import getLogger
from pathlib import Path

logger = getLogger(__name__)


CONFIG_FILES = [
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
]

DOCKERFILE = "Dockerfile"


def resolve_compose_file(parent: str = "") -> str:
    # existing compose file provides all the config we need
    compose = find_compose_file(parent)
    if compose is not None:
        return Path(os.path.join(parent, compose)).resolve().as_posix()

    # temporary auto-compose
    if has_auto_compose_file(parent):
        return Path(os.path.join(parent, AUTO_COMPOSE_YAML)).resolve().as_posix()

    # dockerfile just needs a compose.yaml synthesized
    elif has_dockerfile(parent):
        return auto_compose_file(
            COMPOSE_DOCKERFILE_YAML.format(dockerfile=DOCKERFILE), parent
        )

    # otherwise provide a generic python container
    else:
        return auto_compose_file(COMPOSE_GENERIC_YAML, parent)


def find_compose_file(parent: str = "") -> str | None:
    for file in CONFIG_FILES:
        if os.path.isfile(os.path.join(parent, file)):
            return file
    return None


def is_dockerfile(file: str) -> bool:
    path = Path(file)
    return path.stem == DOCKERFILE or path.suffix == f".{DOCKERFILE}"


def has_dockerfile(parent: str = "") -> bool:
    return os.path.isfile(os.path.join(parent, DOCKERFILE))


def has_auto_compose_file(parent: str = "") -> bool:
    return os.path.isfile(os.path.join(parent, AUTO_COMPOSE_YAML))


def is_auto_compose_file(file: str) -> bool:
    return os.path.basename(file) == AUTO_COMPOSE_YAML


def ensure_auto_compose_file(file: str | None) -> None:
    if file is not None and is_auto_compose_file(file) and not os.path.exists(file):
        resolve_compose_file(os.path.dirname(file))


def safe_cleanup_auto_compose(file: str | None) -> None:
    if file:
        try:
            if is_auto_compose_file(file) and os.path.exists(file):
                os.unlink(file)
        except Exception as ex:
            logger.warning(f"Error cleaning up compose file: {ex}")


AUTO_COMPOSE_YAML = ".compose.yaml"

COMPOSE_COMMENT = """# inspect auto-generated docker compose file
# (will be removed when task is complete)"""

COMPOSE_GENERIC_YAML = f"""{COMPOSE_COMMENT}
services:
  default:
    image: "aisiuk/inspect-tool-support"
    command: "tail -f /dev/null"
    init: true
    network_mode: none
    stop_grace_period: 1s
"""

COMPOSE_DOCKERFILE_YAML = f"""{COMPOSE_COMMENT}
services:
  default:
    build:
      context: "."
      dockerfile: "{{dockerfile}}"
    command: "tail -f /dev/null"
    init: true
    network_mode: none
    stop_grace_period: 1s
"""


def auto_compose_file(contents: str, parent: str = "") -> str:
    path = os.path.join(parent, AUTO_COMPOSE_YAML)
    with open(path, "w", encoding="utf-8") as f:
        f.write(contents)
    return Path(path).resolve().as_posix()
