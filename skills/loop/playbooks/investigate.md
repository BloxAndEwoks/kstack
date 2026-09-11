# Playbook: investigate

A read-only question about the codebase or its behavior. The deliverable is a cited
answer — no PR.

1. **State the question precisely.** "How does X work", "why was Y built this way",
   "are we sure about Z" — the answer must address exactly that.
2. **Read, then run.** Trace the code path; where behavior is the question, observe
   it (run the thing, hit the endpoint, read the logs). Evidence over recollection.
3. **Cite everything.** Every claim lands on a file:line, a command output, or a
   commit. A claim with no citation is a guess — mark it as one or go get the
   evidence.
4. **Answer the question asked.** Findings beyond the question go in a short
   "adjacent observations" tail, clearly separated — never smuggled into the answer.
5. **No bookend.** This playbook does not produce a PR. If the answer reveals work
   that should happen, name it and stop — let the user route it.

**Reply:** the answer, citations inline, confidence level, what remains unproven.
