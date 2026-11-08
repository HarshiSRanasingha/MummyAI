const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const databasePath = require.resolve("../src/database");
const database = require(databasePath);
const originalFetch = global.fetch;
const originalDatabaseExports = require.cache[databasePath].exports;

let records = [
  {
    childId: "demo-child-001",
    displayName: "Demo Child A",
    dateOfBirth: new Date("2022-06-15T00:00:00.000Z"),
    isSynthetic: true,
    visits: []
  }
];
let listSyntheticChildrenImpl = async () => records;

require.cache[databasePath].exports = {
  ...database,
  listSyntheticChildren: () => listSyntheticChildrenImpl(),
  getSyntheticChild: async (childId) => records.find((record) => record.childId === childId) || null
};

const { AgentError, runAgent } = require("../src/agent");

function queueOllamaResponses(messages) {
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const message = messages.shift();
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  return requests;
}

afterEach(() => {
  global.fetch = originalFetch;
  records = [
    {
      childId: "demo-child-001",
      displayName: "Demo Child A",
      dateOfBirth: new Date("2022-06-15T00:00:00.000Z"),
      isSynthetic: true,
      visits: []
    }
  ];
});

test("agent returns synthetic record data to the model through the allowlisted tool", async () => {
  const requests = queueOllamaResponses([
    {
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "list_demo_children", arguments: {} } }]
    },
    { role: "assistant", content: "The database contains one fictional demo profile." }
  ]);

  const answer = await runAgent("List the demo profiles.", "en");

  assert.equal(answer, "The database contains one fictional demo profile.");
  assert.equal(requests.length, 2);
  const toolResult = JSON.parse(requests[1].messages.at(-1).content);
  assert.equal(requests[1].messages.at(-1).role, "tool");
  assert.equal(toolResult.recordsAreSynthetic, true);
  assert.equal(toolResult.children[0].childId, "demo-child-001");
});

test("agent retrieves only a synthetically marked profile by validated demo ID", async () => {
  const requests = queueOllamaResponses([
    {
      role: "assistant",
      content: "",
      tool_calls: [{
        function: {
          name: "get_demo_child_record",
          arguments: { child_id: "demo-child-001" }
        }
      }]
    },
    { role: "assistant", content: "This is a fictional sample record." }
  ]);

  await runAgent("Show demo-child-001.", "en");

  const toolResult = JSON.parse(requests[1].messages.at(-1).content);
  assert.equal(toolResult.recordsAreSynthetic, true);
  assert.equal(toolResult.child.isSynthetic, true);
  assert.equal(toolResult.child.displayName, "Demo Child A");
});

test("agent rejects record IDs outside the synthetic demo namespace", async () => {
  const requests = queueOllamaResponses([{
    role: "assistant",
    content: "",
    tool_calls: [{
      function: {
        name: "get_demo_child_record",
        arguments: { child_id: "patient-123" }
      }
    }]
  }]);

  await assert.rejects(
    () => runAgent("Read this profile.", "en"),
    (error) => error instanceof AgentError && error.code === "AI_INVALID_TOOL_ARGUMENTS"
  );
  assert.equal(requests.length, 1);
});

test("agent rejects tools outside its allowlist", async () => {
  queueOllamaResponses([{
    role: "assistant",
    content: "",
    tool_calls: [{ function: { name: "delete_records", arguments: {} } }]
  }]);

  await assert.rejects(
    () => runAgent("Delete a record.", "en"),
    (error) => error instanceof AgentError && error.code === "AI_TOOL_NOT_ALLOWED"
  );
});

test("database failures remain explicit instead of being replaced with empty records", async () => {
  listSyntheticChildrenImpl = async () => {
    const error = new Error("Record tools need MongoDB. Configure MONGODB_URI in backend/.env.");
    error.code = "DATABASE_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  };
  queueOllamaResponses([{
    role: "assistant",
    content: "",
    tool_calls: [{ function: { name: "list_demo_children", arguments: {} } }]
  }]);

  await assert.rejects(
    () => runAgent("List profiles.", "en"),
    (error) => error instanceof AgentError && error.code === "DATABASE_NOT_CONFIGURED"
  );
  listSyntheticChildrenImpl = async () => records;
});

test.after(() => {
  require.cache[databasePath].exports = originalDatabaseExports;
});
