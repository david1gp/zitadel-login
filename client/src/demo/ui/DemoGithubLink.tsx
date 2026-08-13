import { mdiGithub } from "@adaptive-ds/mdi/mdiGithub.js"

import { classesDemoGithubLink } from "../../ui/classes/classesDemoGithubLink"
import { Icon } from "../../ui/Icon"

const demoGithubUrl = "https://github.com/david1gp/zitadel-login"

export function DemoGithubLink() {
  return (
    <a
      class={classesDemoGithubLink}
      href={demoGithubUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="GitHub project"
      title="GitHub"
    >
      <Icon path={mdiGithub} />
    </a>
  )
}
