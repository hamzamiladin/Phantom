export const TEMPLATE_REGISTRY = {
  recursion_tree: {
    id: "recursion_tree",
    name: "Recursion Tree",
    description: "Visualizes recursive function calls as an unfolding tree",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  array_sort: {
    id: "array_sort",
    name: "Array Sort",
    description: "Animated visualization of sorting algorithms",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  async_timeline: {
    id: "async_timeline",
    name: "Async Timeline",
    description: "Timeline visualization of async/concurrent operations",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  state_machine: {
    id: "state_machine",
    name: "State Machine",
    description: "Animated finite state machine with transitions",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  data_pipeline: {
    id: "data_pipeline",
    name: "Data Pipeline",
    description: "Animated data transformation pipeline",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  tree_traversal: {
    id: "tree_traversal",
    name: "Tree Traversal",
    description: "Animated BST/graph traversal",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  hash_map: {
    id: "hash_map",
    name: "Hash Map",
    description: "Animated hash map with collision handling",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  linked_list: {
    id: "linked_list",
    name: "Linked List",
    description: "Animated linked list operations",
    supportedLanguages: ["python", "typescript", "javascript"],
  },
  event_loop: {
    id: "event_loop",
    name: "Event Loop",
    description: "JavaScript event loop visualization",
    supportedLanguages: ["typescript", "javascript"],
  },
  control_flow_branch: {
    id: "control_flow_branch",
    name: "Control Flow Branch",
    description: "Generic animated step-through with variable state panels (fallback)",
    supportedLanguages: ["python", "typescript", "javascript", "rust", "csharp"],
  },
} as const;

export type TemplateId = keyof typeof TEMPLATE_REGISTRY;
