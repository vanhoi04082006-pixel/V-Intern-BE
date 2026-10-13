import {
  assignmentScope,
  classScope,
  projectScope,
  scopedProjectSessionClause,
  sessionScope,
} from './ownership';

describe('ownership scopes', () => {
  it('bypasses everything for admins', () => {
    const admin = { userId: 'u', isAdmin: true };
    expect(sessionScope('s', admin)).toBeNull();
    expect(projectScope('p', admin)).toBeNull();
    expect(assignmentScope('a', admin)).toBeNull();
    expect(classScope('c', admin)).toBeNull();
  });

  it('scopes sessions to lead or member instructor', () => {
    const scope = sessionScope('s', { userId: 'me', isAdmin: false });
    expect(scope?.clause).toContain('session_instructors');
    expect(scope?.clause).toContain('leadInstructorId');
    expect(scope?.params).toEqual({ __ownerId: 'me' });
  });

  it('shows own or unclaimed projects, never those claimed by others', () => {
    const scope = projectScope('p', { userId: 'me', isAdmin: false });
    expect(scope?.clause).toContain('IS NULL');
    expect(scope?.clause).toContain('mentorId');
  });

  it('ties sprints/tasks to a visible project and an owned session', () => {
    const clause = scopedProjectSessionClause('sp.projectId', 'sp.sessionId');
    expect(clause).toContain('projects pj');
    expect(clause).toContain('internship_sessions s2');
  });

  it('shows assignments that are mine or in my sessions', () => {
    const scope = assignmentScope('a', { userId: 'me', isAdmin: false });
    expect(scope?.clause).toContain('internId');
    expect(scope?.clause).toContain('sessionId');
  });

  it('scopes classes to the lead instructor', () => {
    const scope = classScope('c', { userId: 'me', isAdmin: false });
    expect(scope?.clause).toContain('leadInstructorId');
  });
});
