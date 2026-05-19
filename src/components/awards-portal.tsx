"use client";

import { useMemo, useState, useTransition } from "react";

import {
  certifyResultsAction,
  createNominationAction,
  createRunoffAction,
  submitBallotAction,
  upsertMemberAction,
} from "@/app/actions";
import {
  type AwardStage,
  type Category,
  type Finalist,
  type Member,
} from "@/lib/awards/data";
import type { AwardPortalModel } from "@/lib/awards/repository";
import type { CurrentUser } from "@/lib/auth/service";

type ViewKey = "public" | "member" | "reviewer" | "admin";
type VoteSelections = Record<string, string>;
type ReviewStatus = "new" | "recommended" | "needs-info" | "approved";

type PortalResult = { ok: boolean; error?: string; confirmationCode?: string; demo?: boolean };

const roleRank = {
  admin: 3,
  member: 1,
  public: 0,
  reviewer: 2,
} as const;

const allViews: { key: ViewKey; label: string; minRole: keyof typeof roleRank }[] = [
  { key: "public", label: "Public", minRole: "public" },
  { key: "member", label: "Member", minRole: "member" },
  { key: "reviewer", label: "Review", minRole: "reviewer" },
  { key: "admin", label: "Admin", minRole: "admin" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Mark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span>CPA</span>
    </div>
  );
}

function MiniIcon({
  name,
}: {
  name: "check" | "lock" | "mail" | "search" | "shield" | "upload" | "user";
}) {
  const paths = {
    check: "M5 12.5 9.2 16.5 19 7",
    lock: "M7 10V8a5 5 0 0 1 10 0v2M6 10h12v9H6z",
    mail: "M4 6h16v12H4z M4 7l8 6 8-6",
    search: "M10.5 18a7.5 7.5 0 1 1 5.3-2.2L20 20",
    shield: "M12 3 19 6v5c0 4.5-2.8 7.5-7 9-4.2-1.5-7-4.5-7-9V6z",
    upload: "M12 16V4m0 0 4 4m-4-4-4 4M5 18h14",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  };

  return (
    <svg className="mini-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonAvatar({ member, name }: { member?: Pick<Member, "name" | "photoUrl">; name: string }) {
  if (member?.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={member.photoUrl} alt="" />;
  }

  return (
    <span className="avatar" aria-hidden="true">
      {initials(member?.name ?? name)}
    </span>
  );
}

function PhaseRail({ model }: { model: AwardPortalModel }) {
  const currentIndex = model.phases.findIndex((phase) => phase.label === model.cycle.stage);

  return (
    <ol className="phase-rail" aria-label="Awards cycle phases">
      {model.phases.map((phase, index) => (
        <li
          key={phase.label}
          className={index <= currentIndex ? "phase is-complete" : "phase"}
        >
          <span className="phase-dot" />
          <span>
            <strong>{phase.label}</strong>
            <small>{phase.detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

function SignInPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function requestLink() {
    setMessage(null);
    setDevLink(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/request-link", {
        body: JSON.stringify({ email }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        devMagicLink?: string;
        error?: string;
        message?: string;
      };

      setMessage(result.error ?? result.message ?? "Check your email for a sign-in link.");
      setDevLink(result.devMagicLink ?? null);
    });
  }

  return (
    <div className="panel sign-in-panel">
      <div className="panel-head">
        <div>
          <p className="section-label">Member access</p>
          <h2>Email sign-in</h2>
        </div>
        <MiniIcon name="mail" />
      </div>
      <label>
        Email address
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="member@example.com"
          type="email"
          value={email}
        />
      </label>
      <button className="primary-action" disabled={pending || !email} onClick={requestLink} type="button">
        {pending ? "Sending" : "Send sign-in link"}
      </button>
      {message ? <div className="notice">{message}</div> : null}
      {devLink ? (
        <a className="dev-link" href={devLink}>
          Open development sign-in
        </a>
      ) : null}
    </div>
  );
}

function PublicView({
  currentUser,
  model,
  published,
}: {
  currentUser: CurrentUser | null;
  model: AwardPortalModel;
  published: boolean;
}) {
  return (
    <section className="view-grid public-grid">
      <div className="feature-panel full-span">
        <div>
          <p className="section-label">Awards cycle</p>
          <h1>{model.cycle.title}</h1>
          <p className="lede">
            A private CPA member space for nominations, finalist voting, certification, and
            the public winners archive.
          </p>
        </div>
        <div className="date-band" aria-label="Important dates">
          <span>
            <strong>{model.cycle.nominationsOpen}</strong>
            nominations open
          </span>
          <span>
            <strong>{model.cycle.votingOpen}</strong>
            voting opens
          </span>
          <span>
            <strong>{model.cycle.publishDate}</strong>
            winners published
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Archive</p>
            <h2>Certified winners</h2>
          </div>
          <span className={published ? "status good" : "status warn"}>
            {published ? "Published" : "Pending"}
          </span>
        </div>
        <div className="winner-list">
          {model.results.map((result) => (
            <article key={result.category} className="winner-row">
              <span>{result.category}</span>
              <strong>{published ? result.leader : "Certification pending"}</strong>
            </article>
          ))}
        </div>
      </div>

      {currentUser ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="section-label">Signed in</p>
              <h2>{currentUser.member.name}</h2>
            </div>
            <span className="status good">{currentUser.role}</span>
          </div>
          <div className="profile-card">
            <PersonAvatar member={currentUser.member} name={currentUser.member.name} />
            <span>
              <strong>{currentUser.member.email}</strong>
              <small>{currentUser.member.chapter} chapter</small>
            </span>
          </div>
          <form action="/api/auth/sign-out" method="post">
            <button className="secondary-action" type="submit">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <SignInPanel />
      )}
    </section>
  );
}

function CategoryPicker({
  categories,
  selectedCategory,
  setSelectedCategory,
}: {
  categories: Category[];
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;
}) {
  return (
    <div className="category-picker" aria-label="Award category">
      {categories.map((category) => (
        <button
          className={selectedCategory === category.id ? "choice-chip is-selected" : "choice-chip"}
          key={category.id}
          onClick={() => setSelectedCategory(category.id)}
          type="button"
        >
          <strong>{category.title}</strong>
          <small>{category.finalistLimit} finalists</small>
        </button>
      ))}
    </div>
  );
}

function MemberDirectory({
  currentMemberId,
  members,
  selectedNominee,
  setSelectedNominee,
}: {
  currentMemberId: string;
  members: Member[];
  selectedNominee: string;
  setSelectedNominee: (memberId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const eligibleMembers = members.filter(
    (member) => member.status === "active" && member.id !== currentMemberId,
  );
  const filteredMembers = eligibleMembers.filter((member) => {
    const haystack = `${member.name} ${member.chapter} ${member.email}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="directory-block">
      <label className="search-field">
        <MiniIcon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search members"
          type="search"
          value={query}
        />
      </label>
      <div className="people-list">
        {filteredMembers.map((member) => (
          <button
            className={selectedNominee === member.id ? "person-card is-selected" : "person-card"}
            key={member.id}
            onClick={() => setSelectedNominee(member.id)}
            type="button"
          >
            <PersonAvatar member={member} name={member.name} />
            <span>
              <strong>{member.name}</strong>
              <small>
                {member.chapter} chapter · joined {member.joined || "member"}
              </small>
            </span>
            <span className="select-dot" aria-hidden="true">
              <MiniIcon name="check" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FinalistCard({
  category,
  finalist,
  member,
  selected,
  setSelected,
}: {
  category: Category;
  finalist: Finalist;
  member?: Member;
  selected: boolean;
  setSelected: (finalistId: string) => void;
}) {
  return (
    <button
      className={selected ? "finalist-card is-selected" : "finalist-card"}
      onClick={() => setSelected(finalist.id)}
      type="button"
    >
      <span className="finalist-top">
        <PersonAvatar member={member} name={finalist.displayName} />
        <span>
          <strong>{finalist.displayName}</strong>
          <small>{category.title}</small>
        </span>
      </span>
      <span className="finalist-summary">{finalist.summary ?? "Approved finalist"}</span>
      <span className="finalist-meta">
        <span>{finalist.nominationCount} nominations</span>
        <span className="select-dot" aria-hidden="true">
          <MiniIcon name="check" />
        </span>
      </span>
    </button>
  );
}

function MemberView({ currentUser, model }: { currentUser: CurrentUser; model: AwardPortalModel }) {
  const [selectedCategory, setSelectedCategory] = useState(model.categories[0]?.id ?? "");
  const [nominee, setNominee] = useState(
    model.members.find(
      (member) => member.status === "active" && member.id !== currentUser.member.id,
    )?.id ?? "",
  );
  const [statement, setStatement] = useState("");
  const [supportingLink, setSupportingLink] = useState("");
  const [nominationMessage, setNominationMessage] = useState<string | null>(null);
  const [voteSelections, setVoteSelections] = useState<VoteSelections>({});
  const [receipt, setReceipt] = useState<string | null>(null);
  const [ballotMessage, setBallotMessage] = useState<string | null>(null);
  const [pendingNomination, startNominationTransition] = useTransition();
  const [pendingBallot, startBallotTransition] = useTransition();
  const memberById = useMemo(
    () => new Map(model.members.map((member) => [member.id, member])),
    [model.members],
  );
  const selectedQuestion = model.categories.find(
    (category) => category.id === selectedCategory,
  )?.question;
  const votedCategoryCount = Object.keys(voteSelections).length;
  const categoriesWithFinalists = model.categories.filter((category) =>
    model.finalists.some((finalist) => finalist.categoryId === category.id),
  );
  const ballotReady =
    categoriesWithFinalists.length > 0 &&
    categoriesWithFinalists.every((category) => voteSelections[category.id]);

  function submitNomination() {
    setNominationMessage(null);
    startNominationTransition(async () => {
      const result = (await createNominationAction({
        categoryId: selectedCategory,
        nomineeId: nominee,
        statement,
        supportingLink,
      })) as PortalResult;

      setNominationMessage(
        result.ok
          ? result.demo
            ? "Demo nomination saved locally."
            : "Nomination saved."
          : result.error ?? "Unable to save nomination.",
      );
    });
  }

  function submitBallot() {
    setBallotMessage(null);
    startBallotTransition(async () => {
      const result = (await submitBallotAction({
        cycleId: model.cycle.id,
        selections: voteSelections,
      })) as PortalResult;

      if (result.ok) {
        setReceipt(result.confirmationCode ?? `CPA-${model.cycle.id.slice(0, 8).toUpperCase()}`);
      } else {
        setBallotMessage(result.error ?? "Unable to submit ballot.");
      }
    });
  }

  return (
    <section className="view-grid member-grid">
      <div className="panel profile-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Signed in</p>
            <h2>{currentUser.member.name}</h2>
          </div>
          <span className="status good">Active member</span>
        </div>
        <div className="profile-card">
          <PersonAvatar member={currentUser.member} name={currentUser.member.name} />
          <span>
            <strong>{currentUser.member.email}</strong>
            <small>{currentUser.member.chapter} chapter</small>
          </span>
        </div>
        <div className="metric-strip">
          <span>
            <strong>{model.categories.length}</strong>
            categories
          </span>
          <span>
            <strong>{votedCategoryCount}</strong>
            selected
          </span>
        </div>
      </div>

      <form className="panel form-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Peer nomination</p>
            <h2>Nominate a member</h2>
          </div>
          <span className="status neutral">1 per category</span>
        </div>
        <CategoryPicker
          categories={model.categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        />
        <MemberDirectory
          currentMemberId={currentUser.member.id}
          members={model.members}
          selectedNominee={nominee}
          setSelectedNominee={setNominee}
        />
        <label>
          Nomination statement
          <textarea
            onChange={(event) => setStatement(event.target.value)}
            placeholder={selectedQuestion}
            rows={5}
            value={statement}
          />
        </label>
        <label>
          Supporting link
          <input
            onChange={(event) => setSupportingLink(event.target.value)}
            placeholder="https://..."
            type="url"
            value={supportingLink}
          />
        </label>
        <button
          className="primary-action"
          disabled={!statement.trim() || !nominee || pendingNomination}
          onClick={submitNomination}
          type="button"
        >
          {pendingNomination ? "Saving" : "Save nomination"}
        </button>
        {nominationMessage ? <div className="notice">{nominationMessage}</div> : null}
      </form>

      <div className="panel ballot-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Anonymous ballot</p>
            <h2>Vote once per category</h2>
          </div>
          <span className="status good">Voting open</span>
        </div>
        <div className="ballot-list">
          {categoriesWithFinalists.map((category) => {
            const finalists = model.finalists.filter(
              (finalist) => finalist.categoryId === category.id,
            );

            return (
              <section className="ballot-category" key={category.id}>
                <div className="ballot-category-head">
                  <h3>{category.title}</h3>
                  <span>{finalists.length} finalists</span>
                </div>
                <div className="finalist-grid">
                  {finalists.map((finalist) => (
                    <FinalistCard
                      category={category}
                      finalist={finalist}
                      key={finalist.id}
                      member={memberById.get(finalist.nomineeId)}
                      selected={voteSelections[category.id] === finalist.id}
                      setSelected={(finalistId) =>
                        setVoteSelections((current) => ({
                          ...current,
                          [category.id]: finalistId,
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <button
          className="primary-action"
          disabled={!ballotReady || pendingBallot}
          onClick={submitBallot}
          type="button"
        >
          {pendingBallot ? "Submitting" : "Submit ballot"}
        </button>
        {receipt ? (
          <div className="receipt">
            Receipt <strong>{receipt}</strong>
            <span>Selections are stored without member identity.</span>
          </div>
        ) : null}
        {ballotMessage ? <div className="notice warn">{ballotMessage}</div> : null}
      </div>
    </section>
  );
}

function ReviewerView({ model }: { model: AwardPortalModel }) {
  const [reviewStatuses, setReviewStatuses] = useState<Record<string, ReviewStatus>>(
    Object.fromEntries(model.nominations.map((nomination) => [nomination.id, nomination.status])),
  );
  const categoryById = useMemo(
    () => new Map(model.categories.map((category) => [category.id, category])),
    [model.categories],
  );
  const memberById = useMemo(
    () => new Map(model.members.map((member) => [member.id, member])),
    [model.members],
  );

  return (
    <section className="view-grid">
      <div className="panel full-span">
        <div className="panel-head">
          <div>
            <p className="section-label">Reviewer queue</p>
            <h2>Nomination review</h2>
          </div>
          <span className="status neutral">Limited access</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Nominee</th>
                <th>Statement</th>
                <th>Score</th>
                <th>Duplicate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {model.nominations.map((nomination) => (
                <tr key={nomination.id}>
                  <td>{categoryById.get(nomination.categoryId)?.title ?? "Unknown category"}</td>
                  <td>{memberById.get(nomination.nomineeId)?.name ?? "Unknown member"}</td>
                  <td>{nomination.statement}</td>
                  <td>{nomination.reviewerScore}</td>
                  <td>
                    <span className={`risk ${nomination.duplicateRisk}`}>
                      {nomination.duplicateRisk}
                    </span>
                  </td>
                  <td>
                    <select
                      onChange={(event) =>
                        setReviewStatuses((current) => ({
                          ...current,
                          [nomination.id]: event.target.value as ReviewStatus,
                        }))
                      }
                      value={reviewStatuses[nomination.id]}
                    >
                      <option value="new">New</option>
                      <option value="recommended">Recommended</option>
                      <option value="needs-info">Needs info</option>
                      <option value="approved">Approved</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AdminView({
  model,
  published,
  setPublished,
}: {
  model: AwardPortalModel;
  published: boolean;
  setPublished: (value: boolean) => void;
}) {
  const [stage, setStage] = useState(model.cycle.stage);
  const [runoffCreated, setRunoffCreated] = useState(false);
  const [memberForm, setMemberForm] = useState({
    chapter: "General",
    email: "",
    name: "",
    photoUrl: "",
    status: "active" as Member["status"],
  });
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [pendingMember, startMemberTransition] = useTransition();
  const [pendingPhoto, startPhotoTransition] = useTransition();

  const activeMembers = useMemo(
    () => model.members.filter((member) => member.status === "active").length,
    [model.members],
  );

  function saveMember() {
    setMemberMessage(null);
    startMemberTransition(async () => {
      const result = (await upsertMemberAction(memberForm)) as PortalResult;
      setMemberMessage(result.ok ? "Member saved." : result.error ?? "Unable to save member.");
    });
  }

  function prepareUpload(memberId: string) {
    setPhotoMessage(null);
    startPhotoTransition(async () => {
      const response = await fetch("/api/cloudinary/member-photo-signature", {
        body: JSON.stringify({ memberId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string; ok: boolean };
      setPhotoMessage(result.ok ? "Cloudinary upload signature ready." : result.error ?? "Upload not ready.");
    });
  }

  async function createRunoff(categoryId: string) {
    const result = (await createRunoffAction(categoryId)) as PortalResult;
    if (result.ok) setRunoffCreated(true);
  }

  async function publish(categoryId: string) {
    const result = (await certifyResultsAction(categoryId)) as PortalResult;
    if (result.ok) setPublished(true);
  }

  return (
    <section className="view-grid admin-grid">
      <div className="panel command-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Admin command</p>
            <h2>{model.cycle.title}</h2>
          </div>
          <select onChange={(event) => setStage(event.target.value as AwardStage)} value={stage}>
            {model.phases.map((phase) => (
              <option key={phase.label} value={phase.label}>
                {phase.label}
              </option>
            ))}
          </select>
        </div>
        <div className="metric-grid">
          <span>
            <strong>{activeMembers}</strong> active members
          </span>
          <span>
            <strong>{model.categories.length}</strong> categories
          </span>
          <span>
            <strong>{model.nominations.length}</strong> nominations
          </span>
          <span>
            <strong>{model.finalists.length}</strong> finalists
          </span>
        </div>
        <div className="action-row">
          <button
            className="secondary-action"
            onClick={() => createRunoff(model.categories[0]?.id ?? "")}
            type="button"
          >
            Create runoff for tie
          </button>
          <button
            className="primary-action"
            onClick={() => publish(model.categories[0]?.id ?? "")}
            type="button"
          >
            Certify and publish
          </button>
        </div>
        {runoffCreated ? <div className="notice">Runoff category drafted.</div> : null}
        {published ? <div className="notice good">Winners are visible in the public archive.</div> : null}
      </div>

      <div className="panel roster-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Roster</p>
            <h2>Member directory</h2>
          </div>
          <MiniIcon name="user" />
        </div>
        <div className="compact-list">
          {model.members.map((member) => (
            <div className="compact-row with-avatar" key={member.id}>
              <PersonAvatar member={member} name={member.name} />
              <span>
                <strong>{member.name}</strong>
                <small>{member.email}</small>
              </span>
              <span className={member.status === "active" ? "status good" : "status warn"}>
                {member.status}
              </span>
              <button
                aria-label={`Prepare photo upload for ${member.name}`}
                className="icon-button"
                disabled={pendingPhoto}
                onClick={() => prepareUpload(member.id)}
                title="Prepare photo upload"
                type="button"
              >
                <MiniIcon name="upload" />
              </button>
            </div>
          ))}
        </div>
        {photoMessage ? <div className="notice">{photoMessage}</div> : null}
      </div>

      <form className="panel member-editor">
        <div className="panel-head">
          <div>
            <p className="section-label">Member management</p>
            <h2>Add member</h2>
          </div>
          <span className="status neutral">Admin</span>
        </div>
        <label>
          Name
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
            value={memberForm.name}
          />
        </label>
        <label>
          Email
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
            type="email"
            value={memberForm.email}
          />
        </label>
        <label>
          Chapter
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, chapter: event.target.value }))}
            value={memberForm.chapter}
          />
        </label>
        <label>
          Photo URL
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, photoUrl: event.target.value }))}
            placeholder="https://res.cloudinary.com/..."
            type="url"
            value={memberForm.photoUrl}
          />
        </label>
        <label>
          Status
          <select
            onChange={(event) =>
              setMemberForm((current) => ({
                ...current,
                status: event.target.value as Member["status"],
              }))
            }
            value={memberForm.status}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <button
          className="primary-action"
          disabled={pendingMember || !memberForm.name || !memberForm.email}
          onClick={saveMember}
          type="button"
        >
          {pendingMember ? "Saving" : "Save member"}
        </button>
        {memberMessage ? <div className="notice">{memberMessage}</div> : null}
      </form>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Categories</p>
            <h2>Custom questions</h2>
          </div>
          <span className="status neutral">Editable</span>
        </div>
        <div className="category-list">
          {model.categories.map((category) => (
            <article key={category.id}>
              <strong>{category.title}</strong>
              <p>{category.question}</p>
              <span>
                {category.finalistLimit} finalists, {category.nominationLimit} nomination per member
              </span>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Results</p>
            <h2>Certification queue</h2>
          </div>
          <span className="status warn">Tie checks</span>
        </div>
        <div className="result-list">
          {model.results.map((result) => (
            <div className="result-row" key={result.category}>
              <span>
                <strong>{result.category}</strong>
                <small>{result.leader}</small>
              </span>
              <span>{result.count} votes</span>
              <span className={result.status === "ready" ? "status good" : "status warn"}>
                {result.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel audit-panel">
        <div className="panel-head">
          <div>
            <p className="section-label">Audit log</p>
            <h2>Staff actions</h2>
          </div>
          <MiniIcon name="shield" />
        </div>
        <div className="compact-list">
          {model.audit.map((event) => (
            <div className="compact-row" key={event.id}>
              <span>
                <strong>{event.action}</strong>
                <small>
                  {event.actor} on {event.target}
                </small>
              </span>
              <time>{event.time}</time>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AwardsPortal({
  currentUser,
  model,
}: {
  currentUser: CurrentUser | null;
  model: AwardPortalModel;
}) {
  const role = currentUser?.role ?? "public";
  const availableViews = allViews.filter((view) => roleRank[role] >= roleRank[view.minRole]);
  const [activeView, setActiveView] = useState<ViewKey>(currentUser ? "member" : "public");
  const [published, setPublished] = useState(model.cycle.stage === "Published");
  const visibleView = availableViews.some((view) => view.key === activeView)
    ? activeView
    : "public";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CPA Awards home">
          <Mark />
          <span>
            <strong>CPA Awards</strong>
            <small>Member nominations and voting</small>
          </span>
        </a>
        <nav className="view-switch" aria-label="Workspace view">
          {availableViews.map((view) => (
            <button
              className={visibleView === view.key ? "is-active" : ""}
              key={view.key}
              onClick={() => setActiveView(view.key)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="cycle-banner" id="top">
        <div>
          <p className="section-label">Current cycle</p>
          <h1>{model.cycle.title}</h1>
        </div>
        <PhaseRail model={model} />
      </section>

      {visibleView === "public" ? (
        <PublicView currentUser={currentUser} model={model} published={published} />
      ) : null}
      {visibleView === "member" && currentUser ? (
        <MemberView currentUser={currentUser} model={model} />
      ) : null}
      {visibleView === "reviewer" ? <ReviewerView model={model} /> : null}
      {visibleView === "admin" ? (
        <AdminView model={model} published={published} setPublished={setPublished} />
      ) : null}
    </main>
  );
}
