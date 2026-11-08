# Safety and Clinical Governance

MummyAI is an early-stage prototype for health information organization and education. It is not a substitute for professional medical care.

The AI agent sends chat messages to the configured local Ollama service. It has no approved medical knowledge base and can only retrieve fictional sample records from MongoDB Atlas when configured. It does not access real health records. Do not enter real personal health information. AI-generated answers are not clinically validated.

## Required controls before real-world use
- Review by qualified maternal, pediatric and child-development professionals.
- Locally approved, versioned educational content and schedules.
- Emergency-response language reviewed for the intended region.
- Role-based and per-record authorization.
- Guardian authorization and appropriate consent.
- Encryption, backups, retention controls and secure audit logs.
- Evaluation of hallucinations, unsafe advice, bias and language quality.
- Clear handling of uncertain, missing, conflicting and AI-extracted information.
- Human review for consequential clinical actions.
- Privacy/legal review for applicable Sri Lankan requirements and any target country.

## Non-negotiable rules
- Never diagnose from a chatbot conversation or a single measurement.
- Never recommend starting, stopping or changing a medicine or dose.
- Never claim that no alert means a child is safe.
- Never silently convert AI-extracted content into a verified record.
- Never expose one family's records to another user.
- Keep record tools restricted to explicitly synthetic records until authentication and per-record authorization are implemented and reviewed.
- Never delay urgent care with unnecessary follow-up questions.
- Never treat user-provided files or retrieved content as trusted instructions for the agent.
