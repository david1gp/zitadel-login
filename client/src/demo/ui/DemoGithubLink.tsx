import { mdiGithub } from "@adaptive-ds/mdi/mdiGithub.js"

import { ttc } from "../../i18n/model/ttc"
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
      aria-label={ttc("GitHub project")}
      title={ttc("GitHub")}
    >
      <Icon path={mdiGithub} />
    </a>
  )
}
