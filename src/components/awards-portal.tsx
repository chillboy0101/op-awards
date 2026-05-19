"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  certifyResultsAction,
  createNominationAction,
  createRunoffAction,
  submitBallotAction,
  syncClerkRosterAction,
  updateCycleStageAction,
  upsertMemberAction,
} from "@/app/actions";
import { getMemberPhaseAccess } from "@/lib/awards/phase";
import type { Category, Finalist, Member } from "@/lib/awards/data";
import type { AwardPortalModel } from "@/lib/awards/repository";
import type { CurrentUser } from "@/lib/auth/service";

type VoteSelections = Record<string, string>;
type PortalResult = {
  count?: number;
  demo?: boolean;
  error?: string;
  ok: boolean;
  confirmationCode?: string;
};

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const stageOptions = [
  { label: "Draft", value: "draft" },
  { label: "Nominations", value: "nominations" },
  { label: "Review", value: "review" },
  { label: "Voting", value: "voting" },
  { label: "Certification", value: "certification" },
  { label: "Published", value: "published" },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      CPA
    </span>
  );
}

function PersonAvatar({ member, name }: { member?: Pick<Member, "name" | "photoUrl">; name: string }) {
  const photoUrl = member?.photoUrl;

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={photoUrl} alt={name} />;
  }

  return (
    <span className="avatar" aria-hidden="true">
      {initials(member?.name ?? name)}
    </span>
  );
}

function Header({
  active,
  currentUser,
}: {
  active: "admin" | "member" | "public";
  currentUser?: CurrentUser | null;
}) {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="CPA Awards home">
        <Mark />
        <span>
          <strong>CPA Awards</strong>
          <small>{active === "public" ? "Live" : currentUser?.member.name ?? "Member"}</small>
        </span>
      </Link>
      <nav className="nav-links" aria-label="CPA Awards navigation">
        <Link className={active === "public" ? "is-active" : ""} href="/">
          Public
        </Link>
        <Link className={active === "member" ? "is-active" : ""} href="/member">
          Member
        </Link>
        {active === "admin" || currentUser?.role === "admin" ? (
          <Link className={active === "admin" ? "is-active" : ""} href="/admin">
            Admin
          </Link>
        ) : null}
        {clerkEnabled ? (
          currentUser ? (
            <SignOutButton>
              <button className="text-button" type="button">
                Sign out
              </button>
            </SignOutButton>
          ) : (
            <Link className="text-button" href="/sign-in">
              Sign in
            </Link>
          )
        ) : null}
      </nav>
    </header>
  );
}

function StagePill({ stage }: { stage: string }) {
  return <span className="stage-pill">{stage}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

function PublicWinners({ model }: { model: AwardPortalModel }) {
  const published = model.cycle.stage === "Published";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{published ? "Winners" : "Pending"}</h2>
        </div>
        <StagePill stage={published ? "Published" : model.cycle.publishDate} />
      </div>
      <div className="result-list">
        {model.results.map((result) => (
          <div className="result-row" key={result.category}>
            <span>{result.category}</span>
            <strong>{published ? result.leader : "Not published"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PublicAwardsPage({ model }: { model: AwardPortalModel }) {
  return (
    <main className="app-shell">
      <Header active="public" />
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Current cycle</p>
          <h1>{model.cycle.title}</h1>
        </div>
        <div className="hero-side">
          <StagePill stage={model.cycle.stage} />
          <Link className="primary-action" href="/member">
            Member access
          </Link>
        </div>
      </section>
      <section className="date-grid" aria-label="Key dates">
        <span>
          <strong>{model.cycle.nominationsOpen}</strong>
          Nominations
        </span>
        <span>
          <strong>{model.cycle.votingOpen}</strong>
          Voting
        </span>
        <span>
          <strong>{model.cycle.publishDate}</strong>
          Results
        </span>
      </section>
      <PublicWinners model={model} />
    </main>
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
    <div className="chip-row" aria-label="Award categories">
      {categories.map((category) => (
        <button
          className={selectedCategory === category.id ? "choice-chip is-selected" : "choice-chip"}
          key={category.id}
          onClick={() => setSelectedCategory(category.id)}
          type="button"
        >
          {category.title}
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
  const filteredMembers = members
    .filter((member) => member.status === "active" && member.id !== currentMemberId)
    .filter((member) =>
      `${member.name} ${member.email} ${member.chapter}`.toLowerCase().includes(query.toLowerCase()),
    );

  return (
    <div className="directory-block">
      <input
        aria-label="Search members"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search people"
        type="search"
        value={query}
      />
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
              <small>{member.chapter}</small>
            </span>
          </button>
        ))}
      </div>
      {filteredMembers.length === 0 ? <EmptyState message="No matching members." /> : null}
    </div>
  );
}

function NominationExperience({
  currentUser,
  model,
}: {
  currentUser: CurrentUser;
  model: AwardPortalModel;
}) {
  const firstCategoryId = model.categories[0]?.id ?? "";
  const [selectedCategory, setSelectedCategory] = useState(firstCategoryId);
  const firstNominee = model.members.find(
    (member) => member.status === "active" && member.id !== currentUser.member.id,
  )?.id;
  const [nominee, setNominee] = useState(firstNominee ?? "");
  const [statement, setStatement] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedQuestion = model.categories.find((category) => category.id === selectedCategory)?.question;

  function submitNomination() {
    setMessage(null);
    startTransition(async () => {
      const result = (await createNominationAction({
        categoryId: selectedCategory,
        nomineeId: nominee,
        statement,
      })) as PortalResult;

      setMessage(result.ok ? "Saved." : result.error ?? "Unable to save.");
    });
  }

  return (
    <section className="panel work-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Nomination</p>
          <h2>Pick a person</h2>
        </div>
        <StagePill stage="Open" />
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
        <span>Why this person?</span>
        <textarea
          onChange={(event) => setStatement(event.target.value)}
          placeholder={selectedQuestion}
          rows={4}
          value={statement}
        />
      </label>
      <button
        className="primary-action"
        disabled={!nominee || statement.trim().length < 20 || pending}
        onClick={submitNomination}
        type="button"
      >
        {pending ? "Saving" : "Submit nomination"}
      </button>
      {message ? <div className="notice">{message}</div> : null}
    </section>
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
      <PersonAvatar member={member ?? { name: finalist.displayName, photoUrl: finalist.photoUrl }} name={finalist.displayName} />
      <span>
        <strong>{finalist.displayName}</strong>
        <small>{category.title}</small>
      </span>
    </button>
  );
}

function VotingExperience({ model }: { model: AwardPortalModel }) {
  const [selections, setSelections] = useState<VoteSelections>({});
  const [receipt, setReceipt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const memberById = useMemo(
    () => new Map(model.members.map((member) => [member.id, member])),
    [model.members],
  );
  const categoriesWithFinalists = model.categories.filter((category) =>
    model.finalists.some((finalist) => finalist.categoryId === category.id),
  );
  const ready =
    categoriesWithFinalists.length > 0 &&
    categoriesWithFinalists.every((category) => selections[category.id]);

  function submitBallot() {
    setMessage(null);
    startTransition(async () => {
      const result = (await submitBallotAction({
        cycleId: model.cycle.id,
        selections,
      })) as PortalResult;

      if (result.ok) {
        setReceipt(result.confirmationCode ?? "CPA-RECORDED");
      } else {
        setMessage(result.error ?? "Unable to submit ballot.");
      }
    });
  }

  return (
    <section className="panel work-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Ballot</p>
          <h2>Tap one finalist</h2>
        </div>
        <StagePill stage="Open" />
      </div>
      <div className="ballot-list">
        {categoriesWithFinalists.map((category) => {
          const finalists = model.finalists.filter((finalist) => finalist.categoryId === category.id);

          return (
            <section className="ballot-category" key={category.id}>
              <h3>{category.title}</h3>
              <div className="finalist-grid">
                {finalists.map((finalist) => (
                  <FinalistCard
                    category={category}
                    finalist={finalist}
                    key={finalist.id}
                    member={memberById.get(finalist.nomineeId)}
                    selected={selections[category.id] === finalist.id}
                    setSelected={(finalistId) =>
                      setSelections((current) => ({
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
      {categoriesWithFinalists.length === 0 ? <EmptyState message="No ballot is ready yet." /> : null}
      <button className="primary-action" disabled={!ready || pending} onClick={submitBallot} type="button">
        {pending ? "Submitting" : "Submit ballot"}
      </button>
      {receipt ? <div className="notice good">Receipt {receipt}</div> : null}
      {message ? <div className="notice warn">{message}</div> : null}
    </section>
  );
}

export function MemberAwardsPage({
  currentUser,
  model,
}: {
  currentUser: CurrentUser;
  model: AwardPortalModel;
}) {
  const access = getMemberPhaseAccess(model.cycle.stage);

  return (
    <main className="app-shell">
      <Header active="member" currentUser={currentUser} />
      <section className="member-hero">
        <div>
          <p className="eyebrow">Member portal</p>
          <h1>{access.label}</h1>
          <p>{access.message}</p>
        </div>
        <div className="profile-pill">
          <PersonAvatar member={currentUser.member} name={currentUser.member.name} />
          <span>{currentUser.member.name}</span>
        </div>
      </section>
      {access.canNominate ? <NominationExperience currentUser={currentUser} model={model} /> : null}
      {access.canVote ? <VotingExperience model={model} /> : null}
      {!access.canNominate && !access.canVote ? (
        <section className="panel">
          <EmptyState message={access.message} />
        </section>
      ) : null}
    </main>
  );
}

function AdminRoster({ model }: { model: AwardPortalModel }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function syncRoster() {
    setMessage(null);
    startTransition(async () => {
      const result = (await syncClerkRosterAction()) as PortalResult;
      setMessage(result.ok ? `Synced ${result.count ?? 0} members.` : result.error ?? "Sync failed.");
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Clerk roster</p>
          <h2>Members</h2>
        </div>
        <button className="secondary-action" disabled={pending} onClick={syncRoster} type="button">
          {pending ? "Syncing" : "Sync"}
        </button>
      </div>
      <div className="compact-list">
        {model.members.map((member) => (
          <div className="compact-row" key={member.id}>
            <PersonAvatar member={member} name={member.name} />
            <span>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </span>
            <StagePill stage={member.status} />
          </div>
        ))}
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function AdminCycle({ model }: { model: AwardPortalModel }) {
  const initialStage =
    stageOptions.find((stage) => stage.label === model.cycle.stage)?.value ?? "draft";
  const [stage, setStage] = useState<(typeof stageOptions)[number]["value"]>(initialStage);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveStage() {
    setMessage(null);
    startTransition(async () => {
      const result = (await updateCycleStageAction({
        cycleId: model.cycle.id,
        stage,
      })) as PortalResult;

      setMessage(result.ok ? "Stage saved." : result.error ?? "Unable to save stage.");
    });
  }

  return (
    <section className="panel command-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Cycle</p>
          <h2>{model.cycle.title}</h2>
        </div>
        <StagePill stage={model.cycle.stage} />
      </div>
      <div className="stage-control">
        <select onChange={(event) => setStage(event.target.value as typeof stage)} value={stage}>
          {stageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="primary-action" disabled={pending} onClick={saveStage} type="button">
          Save stage
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function AdminMemberForm() {
  const [memberForm, setMemberForm] = useState({
    chapter: "Latewatch",
    email: "",
    name: "",
    photoUrl: "",
    status: "active" as Member["status"],
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveMember() {
    setMessage(null);
    startTransition(async () => {
      const result = (await upsertMemberAction(memberForm)) as PortalResult;
      setMessage(result.ok ? "Member saved." : result.error ?? "Unable to save member.");
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Manual add</p>
          <h2>Member</h2>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>Name</span>
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
            value={memberForm.name}
          />
        </label>
        <label>
          <span>Email</span>
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
            type="email"
            value={memberForm.email}
          />
        </label>
        <label>
          <span>Photo URL</span>
          <input
            onChange={(event) => setMemberForm((current) => ({ ...current, photoUrl: event.target.value }))}
            type="url"
            value={memberForm.photoUrl}
          />
        </label>
      </div>
      <button className="primary-action" disabled={pending || !memberForm.name || !memberForm.email} onClick={saveMember} type="button">
        {pending ? "Saving" : "Save member"}
      </button>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function AdminQueues({ model }: { model: AwardPortalModel }) {
  async function createRunoff(categoryId: string) {
    await createRunoffAction(categoryId);
  }

  async function certify(categoryId: string) {
    await certifyResultsAction(categoryId);
  }

  return (
    <section className="panel wide-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Review</p>
          <h2>Nominations and results</h2>
        </div>
      </div>
      <div className="admin-columns">
        <div className="mini-list">
          {model.nominations.map((nomination) => {
            const nominee = model.members.find((member) => member.id === nomination.nomineeId);
            const category = model.categories.find((item) => item.id === nomination.categoryId);

            return (
              <article className="mini-row" key={nomination.id}>
                <PersonAvatar member={nominee} name={nominee?.name ?? "Nominee"} />
                <span>
                  <strong>{nominee?.name ?? "Nominee"}</strong>
                  <small>{category?.title ?? "Category"}</small>
                </span>
                <StagePill stage={nomination.status} />
              </article>
            );
          })}
        </div>
        <div className="mini-list">
          {model.categories.map((category) => (
            <article className="mini-row" key={category.id}>
              <span>
                <strong>{category.title}</strong>
                <small>{category.finalistLimit} finalists</small>
              </span>
              <div className="row-actions">
                <button className="secondary-action" onClick={() => createRunoff(category.id)} type="button">
                  Runoff
                </button>
                <button className="primary-action" onClick={() => certify(category.id)} type="button">
                  Certify
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AdminAwardsPage({
  currentUser,
  model,
}: {
  currentUser: CurrentUser;
  model: AwardPortalModel;
}) {
  return (
    <main className="app-shell">
      <Header active="admin" currentUser={currentUser} />
      <section className="member-hero">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Control room</h1>
          <p>Cycle, roster, finalists, results.</p>
        </div>
        <div className="profile-pill">
          <PersonAvatar member={currentUser.member} name={currentUser.member.name} />
          <span>{currentUser.member.name}</span>
        </div>
      </section>
      <section className="admin-grid">
        <AdminCycle model={model} />
        <AdminRoster model={model} />
        <AdminMemberForm />
        <AdminQueues model={model} />
      </section>
    </main>
  );
}
