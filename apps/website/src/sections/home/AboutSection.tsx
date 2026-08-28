import { Item, Reveal, Sequence } from "@/components/shared/Reveal";
import { SectionMark } from "@/components/shared/SectionMark";

type Member = {
  name: string;
  org: string;
  major: string;
  lead?: boolean;
};

/**
 * Roster, universities and majors are taken verbatim from the team
 * registration sheet. No invented job titles.
 */
const team: Member[] = [
  { name: "Nguyễn Hữu Phước", org: "HCMUT", major: "Computer Science", lead: true },
  { name: "Nguyễn Anh Nhân", org: "HCMUT", major: "Industrial Management" },
  { name: "Lê Nguyễn Thành Danh", org: "UIT", major: "Computer Engineering" },
  { name: "Trần Minh Nhật", org: "UIT", major: "Computer Engineering" },
  { name: "Lê Nguyễn Khương Duy", org: "RMIT", major: "Software Engineering" },
  { name: "Trương Quốc Trí", org: "RMIT", major: "Software Engineering" },
];

const advisors = [
  {
    name: "Nguyễn Ngọc Bình Phương",
    org: "HCMUT",
    title: "Industrial Management Lecturer",
  },
  { name: "Nguyễn Hữu Thuận", org: "Bosch Vietnam", title: "Senior Embedded Engineer" },
  { name: "Khương Anh Dũng", org: "Bosch Vietnam", title: "Head of R&D" },
];

export function AboutSection() {
  return (
    <section id="about" className="surface-stone scroll-mt-24">
      <div className="mx-auto max-w-[1600px] px-8 py-24 md:px-14 md:py-32">
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-24">
          <div className="lg:sticky lg:top-32">
            <Reveal>
              <SectionMark label="Team" />
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="section-title section-title--sm">
                Six students,
                <br />
                three universities.
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="lead mt-7 max-w-[40ch]">
                Team BKUIT brings together six students from HCMUT, UIT and RMIT across Computer
                Science, Computer Engineering, Software Engineering and Industrial Management.
              </p>
            </Reveal>
          </div>

          <div>
            {/* A roster is a list, so it reads down quickly — short beats,
                small travel, no per-row drama. */}
            <Sequence className="roster" as="ul" step={0.055}>
              {team.map((member) => (
                <Item
                  key={member.name}
                  as="li"
                  className={`roster__item ${member.lead ? "roster__item--lead" : ""}`}
                >
                  <strong>
                    {member.name}
                    {member.lead && <span className="roster__lead">Team lead</span>}
                  </strong>
                  <span className="roster__meta">
                    <span className="roster__org">{member.org}</span>
                    <span className="roster__sep" aria-hidden="true" />
                    <span>{member.major}</span>
                  </span>
                </Item>
              ))}
            </Sequence>

            <Reveal delay={0.1}>
              <div className="advisors">
                <p className="mono text-muted-foreground">Advisors</p>
                <ul>
                  {advisors.map((advisor) => (
                    <li key={advisor.name}>
                      <strong>{advisor.name}</strong>
                      <small>{advisor.title}</small>
                      <span className="advisors__org">{advisor.org}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
