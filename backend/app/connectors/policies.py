"""Central non-LLM integration permissions. External portals use Assisted/Copilot mode."""
from dataclasses import dataclass
from enum import Enum


class SubmissionMode(str, Enum):
    SANDBOX = "sandbox"
    ASSISTED = "assisted"
    UNSUPPORTED = "unsupported"


@dataclass(frozen=True)
class Capabilities:
    discovery: bool
    submission: SubmissionMode
    requires_approval: bool = True


CONNECTOR_CAPABILITIES = {
    "sandbox": Capabilities(discovery=True, submission=SubmissionMode.SANDBOX),
    "greenhouse": Capabilities(discovery=True, submission=SubmissionMode.ASSISTED),
    "lever": Capabilities(discovery=True, submission=SubmissionMode.ASSISTED),
    "ashby": Capabilities(discovery=True, submission=SubmissionMode.ASSISTED),
    "remotive": Capabilities(discovery=True, submission=SubmissionMode.ASSISTED),
    "arbeitnow": Capabilities(discovery=True, submission=SubmissionMode.ASSISTED),
    "url_import": Capabilities(discovery=False, submission=SubmissionMode.ASSISTED),
    "manual": Capabilities(discovery=False, submission=SubmissionMode.ASSISTED),
}


def may_automate_submission(source: str, approved: bool) -> bool:
    capabilities = CONNECTOR_CAPABILITIES.get(source)
    return bool(approved and capabilities and capabilities.submission == SubmissionMode.SANDBOX)
