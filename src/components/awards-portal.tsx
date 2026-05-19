"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  approveFinalistsAction,
  certifyResultsAction,
  createNominationAction,
  createRunoffAction,
  publishWinnersAction,
  submitBallotAction,
  syncClerkRosterAction,
  updateCycleScheduleAction,
  upsertCategoryAction,
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => part.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      O&P
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

function ProfilePill({ currentUser }: { currentUser: CurrentUser }) {
  return (
    <div className="profile-pill">
      <PersonAvatar member={currentUser.member} name={currentUser.member.name} />
      <span>{currentUser.member.name}</span>
      {clerkEnabled ? (
        <SignOutButton>
          <button className="profile-signout" type="button">
            Sign out
          </button>
        </SignOutButton>
      ) : null}
    </div>
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
      <Link className="brand" href="/" aria-label="O&P Awards home">
        <Mark />
        <span>
          <strong>O&P AWARDS</strong>
          <small>{active === "public" ? "Live" : currentUser?.member.name ?? "Member"}</small>
        </span>
      </Link>
      <nav className="nav-links" aria-label="O&P Awards navigation">
        <Link className={active === "public" ? "is-active" : ""} href="/">
          Public
        </Link>
        <Link className={active === "member" ? "is-active" : ""} href="/member">
          Awards Portal
        </Link>
        {active === "admin" ? (
          <Link className={active === "admin" ? "is-active" : ""} href="/admin">
            Admin
          </Link>
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
  const winners = model.results.filter((result) => published && result.leader !== "Pending");

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{published ? "Winners" : "Pending"}</h2>
        </div>
        <StagePill stage={published ? "Published" : "Pending"} />
      </div>
      {published ? (
        <div className="celebration-scene" aria-label="Winner celebration">
          <span className="confetti confetti-a" />
          <span className="confetti confetti-b" />
          <span className="confetti confetti-c" />
          <span className="confetti confetti-d" />
          <div>
            <h3>Congratulations</h3>
            <p>{winners.length ? "The honorees are live." : "Results are published."}</p>
          </div>
        </div>
      ) : null}
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

function getStageAction(stage: string) {
  const access = getMemberPhaseAccess(stage);

  if (access.canNominate) return "Members can nominate now.";
  if (access.canVote) return "Members can vote now.";
  if (access.label === "Published") return "Winners are live.";
  if (access.label === "Review") return "Review is in progress.";
  if (access.label === "Certification") return "Results are being certified.";

  return "The next cycle is being prepared.";
}

function PublicCycleStatus({ model }: { model: AwardPortalModel }) {
  return (
    <section className="status-strip" aria-label="Current awards status">
      <StagePill stage={model.cycle.stage} />
      <span>{getStageAction(model.cycle.stage)}</span>
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
            Awards Portal
          </Link>
        </div>
      </section>
      <PublicCycleStatus model={model} />
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
  const activeCategories = model.categories.filter((category) => category.active);
  const firstCategoryId = activeCategories[0]?.id ?? "";
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
        categories={activeCategories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
      />
      {activeCategories.length === 0 ? <EmptyState message="No active categories yet." /> : null}
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
        disabled={!selectedCategory || !nominee || statement.trim().length < 20 || pending}
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
    category.active &&
    model.finalists.some(
      (finalist) => finalist.categoryId === category.id && finalist.status === "approved",
    ),
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
        setReceipt(result.confirmationCode ?? "OP-RECORDED");
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
          const finalists = model.finalists.filter(
            (finalist) => finalist.categoryId === category.id && finalist.status === "approved",
          );

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
          <p className="eyebrow">Awards Portal</p>
          <h1>{access.label}</h1>
          <p>{access.message}</p>
        </div>
        <ProfilePill currentUser={currentUser} />
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
  const router = useRouter();

  function syncRoster() {
    setMessage(null);
    startTransition(async () => {
      const result = (await syncClerkRosterAction()) as PortalResult;
      setMessage(result.ok ? `Synced ${result.count ?? 0} members.` : result.error ?? "Sync failed.");
      if (result.ok) router.refresh();
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
  const [schedule, setSchedule] = useState({
    nominationsCloseAt: toDateTimeLocal(model.cycle.nominationsCloseAt),
    nominationsOpenAt: toDateTimeLocal(model.cycle.nominationsOpenAt),
    publishAt: toDateTimeLocal(model.cycle.publishAt),
    title: model.cycle.title,
    votingCloseAt: toDateTimeLocal(model.cycle.votingCloseAt),
    votingOpenAt: toDateTimeLocal(model.cycle.votingOpenAt),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateScheduleField(field: keyof typeof schedule, value: string) {
    setSchedule((current) => ({ ...current, [field]: value }));
  }

  function saveSchedule() {
    setMessage(null);
    startTransition(async () => {
      const result = (await updateCycleScheduleAction({
        ...schedule,
        cycleId: model.cycle.id,
      })) as PortalResult;

      setMessage(result.ok ? "Schedule saved." : result.error ?? "Unable to save schedule.");
      if (result.ok) router.refresh();
    });
  }

  function publishWinners() {
    setMessage(null);
    startTransition(async () => {
      const result = (await publishWinnersAction(model.cycle.id)) as PortalResult;

      setMessage(result.ok ? "Winners published." : result.error ?? "Unable to publish winners.");
      if (result.ok) router.refresh();
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
      <div className="schedule-list">
        <label>
          <span>Cycle title</span>
          <input
            onChange={(event) => updateScheduleField("title", event.target.value)}
            value={schedule.title}
          />
        </label>
        <div className="schedule-row">
          <span>Nominations</span>
          <strong>
            {model.cycle.nominationsOpen} to {model.cycle.nominationsClose}
          </strong>
        </div>
        <div className="schedule-row">
          <span>Voting</span>
          <strong>
            {model.cycle.votingOpen} to {model.cycle.votingClose}
          </strong>
        </div>
        <div className="schedule-row">
          <span>Public results</span>
          <strong>{model.cycle.publishedAt ? "Published" : "Not published"}</strong>
        </div>
        <div className="schedule-form-grid">
          <label>
            <span>Nominations open</span>
            <input
              onChange={(event) => updateScheduleField("nominationsOpenAt", event.target.value)}
              type="datetime-local"
              value={schedule.nominationsOpenAt}
            />
          </label>
          <label>
            <span>Nominations close</span>
            <input
              onChange={(event) => updateScheduleField("nominationsCloseAt", event.target.value)}
              type="datetime-local"
              value={schedule.nominationsCloseAt}
            />
          </label>
          <label>
            <span>Voting open</span>
            <input
              onChange={(event) => updateScheduleField("votingOpenAt", event.target.value)}
              type="datetime-local"
              value={schedule.votingOpenAt}
            />
          </label>
          <label>
            <span>Voting close</span>
            <input
              onChange={(event) => updateScheduleField("votingCloseAt", event.target.value)}
              type="datetime-local"
              value={schedule.votingCloseAt}
            />
          </label>
          <label>
            <span>Publish target</span>
            <input
              onChange={(event) => updateScheduleField("publishAt", event.target.value)}
              type="datetime-local"
              value={schedule.publishAt}
            />
          </label>
        </div>
      </div>
      <div className="cycle-actions">
        <span>Computed from schedule. Admin review and publishing stay manual.</span>
        <button className="secondary-action" disabled={pending} onClick={saveSchedule} type="button">
          Save schedule
        </button>
        <button
          className="primary-action"
          disabled={pending || model.cycle.stage !== "Certification"}
          onClick={publishWinners}
          type="button"
        >
          {pending ? "Publishing" : model.cycle.stage === "Published" ? "Published" : "Publish winners"}
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
  const router = useRouter();

  function saveMember() {
    setMessage(null);
    startTransition(async () => {
      const result = (await upsertMemberAction(memberForm)) as PortalResult;
      setMessage(result.ok ? "Member saved." : result.error ?? "Unable to save member.");
      if (result.ok) router.refresh();
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

function AdminCategoryManager({ model }: { model: AwardPortalModel }) {
  const blankCategory = {
    active: true,
    categoryId: "",
    description: "",
    finalistLimit: 3,
    nominationLimit: 1,
    nominationQuestion: "",
    title: "",
  };
  const [categoryForm, setCategoryForm] = useState(blankCategory);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function editCategory(category: Category) {
    setMessage(null);
    setCategoryForm({
      active: category.active,
      categoryId: category.id,
      description: category.description,
      finalistLimit: category.finalistLimit,
      nominationLimit: category.nominationLimit,
      nominationQuestion: category.question,
      title: category.title,
    });
  }

  function resetCategory(clearMessage = true) {
    if (clearMessage) setMessage(null);
    setCategoryForm(blankCategory);
  }

  function saveCategory() {
    setMessage(null);
    startTransition(async () => {
      const result = (await upsertCategoryAction(categoryForm)) as PortalResult;
      setMessage(result.ok ? "Category saved." : result.error ?? "Unable to save category.");
      if (result.ok) {
        resetCategory(false);
        router.refresh();
      }
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Categories</p>
          <h2>Voting categories</h2>
        </div>
        <button className="secondary-action" onClick={() => resetCategory()} type="button">
          New
        </button>
      </div>
      <div className="compact-list">
        {model.categories.map((category) => (
          <button
            className="compact-row category-edit-row"
            key={category.id}
            onClick={() => editCategory(category)}
            type="button"
          >
            <span>
              <strong>{category.title}</strong>
              <small>
                {category.nominationLimit} nomination / {category.finalistLimit} finalists
              </small>
            </span>
            <StagePill stage="Edit" />
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label>
          <span>Title</span>
          <input
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, title: event.target.value }))
            }
            value={categoryForm.title}
          />
        </label>
        <label>
          <span>Nomination question</span>
          <input
            onChange={(event) =>
              setCategoryForm((current) => ({
                ...current,
                nominationQuestion: event.target.value,
              }))
            }
            value={categoryForm.nominationQuestion}
          />
        </label>
        <label>
          <span>Description</span>
          <textarea
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, description: event.target.value }))
            }
            rows={3}
            value={categoryForm.description}
          />
        </label>
        <label>
          <span>Nominations per member</span>
          <input
            min={1}
            onChange={(event) =>
              setCategoryForm((current) => ({
                ...current,
                nominationLimit: Number(event.target.value),
              }))
            }
            type="number"
            value={categoryForm.nominationLimit}
          />
        </label>
        <label>
          <span>Finalists</span>
          <input
            min={1}
            onChange={(event) =>
              setCategoryForm((current) => ({
                ...current,
                finalistLimit: Number(event.target.value),
              }))
            }
            type="number"
            value={categoryForm.finalistLimit}
          />
        </label>
        <label className="check-row">
          <input
            checked={categoryForm.active}
            onChange={(event) =>
              setCategoryForm((current) => ({ ...current, active: event.target.checked }))
            }
            type="checkbox"
          />
          <span>Active</span>
        </label>
      </div>
      <button
        className="primary-action"
        disabled={pending || !categoryForm.title || !categoryForm.nominationQuestion}
        onClick={saveCategory}
        type="button"
      >
        {pending ? "Saving" : categoryForm.categoryId ? "Update category" : "Create category"}
      </button>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function CategoryActionRow({
  category,
  finalistCount,
  nominationCount,
}: {
  category: Category;
  finalistCount: number;
  nominationCount: number;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function approveFinalists() {
    setMessage(null);
    startTransition(async () => {
      const result = (await approveFinalistsAction(category.id)) as PortalResult;
      setMessage(
        result.ok
          ? `Approved ${result.count ?? 0} finalists.`
          : result.error ?? "Unable to approve finalists.",
      );
      if (result.ok) router.refresh();
    });
  }

  function createRunoff() {
    setMessage(null);
    startTransition(async () => {
      const result = (await createRunoffAction(category.id)) as PortalResult;
      setMessage(result.ok ? "Runoff noted." : result.error ?? "Unable to create runoff.");
      if (result.ok) router.refresh();
    });
  }

  function certify() {
    setMessage(null);
    startTransition(async () => {
      const result = (await certifyResultsAction(category.id)) as PortalResult;
      setMessage(result.ok ? "Results certified." : result.error ?? "Unable to certify results.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <article className="mini-row category-action-row">
      <span>
        <strong>{category.title}</strong>
        <small>
          {nominationCount} nominations / {finalistCount} approved finalists
        </small>
        {message ? <small className="inline-message">{message}</small> : null}
      </span>
      <div className="row-actions">
        <button className="secondary-action" disabled={pending} onClick={approveFinalists} type="button">
          Approve finalists
        </button>
        <button className="secondary-action" disabled={pending} onClick={createRunoff} type="button">
          Runoff
        </button>
        <button className="primary-action" disabled={pending} onClick={certify} type="button">
          Certify
        </button>
      </div>
    </article>
  );
}

function AdminQueues({ model }: { model: AwardPortalModel }) {
  return (
    <section className="panel wide-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Review</p>
          <h2>Queue and finalists</h2>
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
            <CategoryActionRow
              category={category}
              finalistCount={
                model.finalists.filter(
                  (finalist) =>
                    finalist.categoryId === category.id && finalist.status === "approved",
                ).length
              }
              key={category.id}
              nominationCount={
                model.nominations.filter((nomination) => nomination.categoryId === category.id)
                  .length
              }
            />
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
        <ProfilePill currentUser={currentUser} />
      </section>
      <section className="admin-grid">
        <AdminCycle model={model} />
        <AdminCategoryManager model={model} />
        <AdminRoster model={model} />
        <AdminMemberForm />
        <AdminQueues model={model} />
      </section>
    </main>
  );
}
