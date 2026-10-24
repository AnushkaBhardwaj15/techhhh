export interface TechnicalItem {
  id: number;
  term: string;
  clue: string;
  category: string;
  codeSnippet?: string;
}

/**
 * Default ACM Engineering Day Technical Tambola Bank (1 to 90).
 * Matches the 9-column Tambola bands:
 * Col 0: 1–9
 * Col 1: 10–19
 * Col 2: 20–29
 * Col 3: 30–39
 * Col 4: 40–49
 * Col 5: 50–59
 * Col 6: 60–69
 * Col 7: 70–79
 * Col 8: 80–90
 *
 * Includes every item from the user's reference ticket:
 * AWS, Binary Large Object, structured query language, Vitalik Buterin,
 * Doubly-ended LL, Wide area network, Gaussian, All lines are legal,
 * 20 10, good, ODD, FALSE, 3, 85, 5, etc.
 */
export const DEFAULT_TECHNICAL_BANK: TechnicalItem[] = [
  // --- Band 1: 1 - 9 (Column 0) ---
  {
    id: 1,
    term: "AWS",
    clue: "Leading cloud computing platform by Amazon providing EC2, S3, and Lambda",
    category: "Cloud & DevOps",
  },
  {
    id: 2,
    term: "Binary Large Object",
    clue: 'What does the database term "BLOB" stand for?',
    category: "Databases",
  },
  {
    id: 3,
    term: "structured query language",
    clue: 'What does "SQL" stand for?',
    category: "Databases",
  },
  {
    id: 4,
    term: "Vitalik Buterin",
    clue: "Russian-Canadian computer programmer and co-founder of Ethereum",
    category: "Web3 & Crypto",
  },
  {
    id: 5,
    term: "Doubly-ended LL",
    clue: "Linear data structure where elements can be efficiently added and removed from both front and rear",
    category: "Data Structures",
  },
  {
    id: 6,
    term: "Wide area network",
    clue: 'What does "WAN" stand for in computer networks?',
    category: "Networking",
  },
  {
    id: 7,
    term: "Gaussian",
    clue: "Continuous probability distribution characterized by a symmetric bell-shaped curve",
    category: "Math & ML",
  },
  {
    id: 8,
    term: "All lines are legal",
    clue: "Compiler diagnosis for: int x = 5; double y = 2.5; double z = x + y;",
    category: "Syntax & Types",
    codeSnippet: "int x = 5;\ndouble y = 2.5;\ndouble z = x + y;",
  },
  {
    id: 9,
    term: "20 10",
    clue: "What is the output of this Python snippet?",
    category: "Code Execution",
    codeSnippet: 'x = 20\ny = 10\nprint(f"{x} {y}")',
  },

  // --- Band 2: 10 - 19 (Column 1) ---
  {
    id: 10,
    term: "good",
    clue: "Output of string operation:",
    category: "Code Execution",
    codeSnippet: 'msg = "good vibes only"\nprint(msg.split()[0])',
  },
  {
    id: 11,
    term: "ODD",
    clue: "Code execution: What does parity(17) print?",
    category: "Code Execution",
    codeSnippet:
      'def parity(n):\n    return "ODD" if n % 2 else "EVEN"\nprint(parity(17))',
  },
  {
    id: 12,
    term: "FALSE",
    clue: "Boolean logic: Evaluate not(True and (False or not True))",
    category: "Code Execution",
    codeSnippet: "print(not (True and (False or not True)))",
  },
  {
    id: 13,
    term: "3",
    clue: "What is the output of len({1, 2, 2, 3, 3, 3}) in Python?",
    category: "Code Execution",
    codeSnippet: "s = {1, 2, 2, 3, 3, 3}\nprint(len(s))",
  },
  {
    id: 14,
    term: "85",
    clue: "What is the output of: int arr[] = {10, 85, 42}; cout << arr[1];",
    category: "Code Execution",
    codeSnippet: "int arr[] = {10, 85, 42};\ncout << arr[1];",
  },
  {
    id: 15,
    term: "5",
    clue: "What does integer floor division 11 // 2 evaluate to?",
    category: "Code Execution",
    codeSnippet: "print(11 // 2)",
  },
  {
    id: 16,
    term: "Docker",
    clue: "Industry standard open platform for containerizing applications with Dockerfiles",
    category: "Cloud & DevOps",
  },
  {
    id: 17,
    term: "Kubernetes",
    clue: "Open-source container orchestration engine originally developed by Google (K8s)",
    category: "Cloud & DevOps",
  },
  {
    id: 18,
    term: "Git",
    clue: "Distributed version control system created by Linus Torvalds in 2005",
    category: "Tools & Version Control",
  },
  {
    id: 19,
    term: "TypeScript",
    clue: "Open-source language developed by Microsoft that adds static typing to JavaScript",
    category: "Languages",
  },

  // --- Band 3: 20 - 29 (Column 2) ---
  {
    id: 20,
    term: "Rust",
    clue: "Systems programming language known for zero-cost abstractions and borrow checker safety",
    category: "Languages",
  },
  {
    id: 21,
    term: "Alan Turing",
    clue: "Father of modern computing and artificial intelligence who broke the Enigma code",
    category: "CS Pioneers",
  },
  {
    id: 22,
    term: "Ada Lovelace",
    clue: "English mathematician recognized as the world's first computer programmer",
    category: "CS Pioneers",
  },
  {
    id: 23,
    term: "Linus Torvalds",
    clue: "Finnish software engineer who created the Linux kernel and Git",
    category: "CS Pioneers",
  },
  {
    id: 24,
    term: "Dijkstra",
    clue: 'Computer scientist famous for the shortest-path algorithm and "Go To Considered Harmful"',
    category: "Algorithms",
  },
  {
    id: 25,
    term: "Binary Search",
    clue: "Search algorithm with O(log n) time complexity on sorted arrays",
    category: "Algorithms",
  },
  {
    id: 26,
    term: "Red-Black Tree",
    clue: "Self-balancing binary search tree where each node contains an extra color bit",
    category: "Data Structures",
  },
  {
    id: 27,
    term: "Hash Map",
    clue: "Data structure that maps keys to values using a hashing function with average O(1) lookups",
    category: "Data Structures",
  },
  {
    id: 28,
    term: "Stack Overflow",
    clue: "Error condition occurring when call stack memory is exceeded due to infinite recursion",
    category: "Operating Systems",
  },
  {
    id: 29,
    term: "Deadlock",
    clue: "Condition where two or more threads are permanently blocked waiting for resources held by each other",
    category: "Operating Systems",
  },

  // --- Band 4: 30 - 39 (Column 3) ---
  {
    id: 30,
    term: "Semaphore",
    clue: "Variable or abstract data type used to control access to a common resource by multiple processes",
    category: "Operating Systems",
  },
  {
    id: 31,
    term: "DNS",
    clue: "System that resolves human-readable domain names into IP addresses (Domain Name System)",
    category: "Networking",
  },
  {
    id: 32,
    term: "TCP Handshake",
    clue: "Three-way process (SYN, SYN-ACK, ACK) used to establish a reliable network connection",
    category: "Networking",
  },
  {
    id: 33,
    term: "404",
    clue: "HTTP status code returned when the requested resource cannot be found on the server",
    category: "Web & APIs",
  },
  {
    id: 34,
    term: "200 OK",
    clue: "Standard HTTP status code indicating that the request succeeded",
    category: "Web & APIs",
  },
  {
    id: 35,
    term: "500 Error",
    clue: "Generic HTTP status code indicating an unexpected server error",
    category: "Web & APIs",
  },
  {
    id: 36,
    term: "WebSocket",
    clue: "Protocol providing full-duplex communication channels over a single TCP connection",
    category: "Web & APIs",
  },
  {
    id: 37,
    term: "JWT",
    clue: "Compact URL-safe token format composed of Header, Payload, and Signature",
    category: "Security",
  },
  {
    id: 38,
    term: "OAuth 2.0",
    clue: "Industry-standard authorization framework enabling third-party apps to obtain limited access",
    category: "Security",
  },
  {
    id: 39,
    term: "CORS",
    clue: "Browser security mechanism that restricts HTTP requests initiated from cross-origin scripts",
    category: "Security",
  },

  // --- Band 5: 40 - 49 (Column 4) ---
  {
    id: 40,
    term: "PostgreSQL",
    clue: "Advanced open-source object-relational database known for reliability and extensible SQL",
    category: "Databases",
  },
  {
    id: 41,
    term: "Redis",
    clue: "Open-source in-memory key-value data structure store used as a database, cache, and message broker",
    category: "Databases",
  },
  {
    id: 42,
    term: "42",
    clue: "Douglas Adams' Answer to the Ultimate Question of Life, the Universe, and Everything",
    category: "Tech Lore",
  },
  {
    id: 43,
    term: "MongoDB",
    clue: "Popular document-oriented NoSQL database that stores data in flexible BSON documents",
    category: "Databases",
  },
  {
    id: 44,
    term: "ACID",
    clue: "Database transaction properties: Atomicity, Consistency, Isolation, and Durability",
    category: "Databases",
  },
  {
    id: 45,
    term: "Index",
    clue: "Database data structure (like B-Tree) that improves data retrieval speed at the cost of writes",
    category: "Databases",
  },
  {
    id: 46,
    term: "Apache Kafka",
    clue: "Distributed event streaming platform capable of handling trillions of events a day",
    category: "Architecture",
  },
  {
    id: 47,
    term: "CI/CD",
    clue: "DevOps methodology combining Continuous Integration and Continuous Delivery/Deployment",
    category: "Cloud & DevOps",
  },
  {
    id: 48,
    term: "GraphQL",
    clue: "Query language for APIs created by Meta allowing clients to request exactly what they need",
    category: "Web & APIs",
  },
  {
    id: 49,
    term: "REST",
    clue: "Architectural style for web services using stateless operations on URI resources",
    category: "Web & APIs",
  },

  // --- Band 6: 50 - 59 (Column 5) ---
  {
    id: 50,
    term: "O(n log n)",
    clue: "Optimal average time complexity for comparison-based sorting algorithms like Merge Sort",
    category: "Algorithms",
  },
  {
    id: 51,
    term: "Quicksort",
    clue: "Divide-and-conquer sorting algorithm developed by Tony Hoare choosing a pivot element",
    category: "Algorithms",
  },
  {
    id: 52,
    term: "Breadth First Search",
    clue: "Graph traversal algorithm that explores all neighbor nodes at the present depth before moving deeper (BFS)",
    category: "Algorithms",
  },
  {
    id: 53,
    term: "Depth First Search",
    clue: "Graph traversal algorithm that explores as far as possible along each branch before backtracking (DFS)",
    category: "Algorithms",
  },
  {
    id: 54,
    term: "SHA-256",
    clue: "Cryptographic hash function producing a 256-bit signature, widely used in Bitcoin",
    category: "Security",
  },
  {
    id: 55,
    term: "RSA",
    clue: "Public-key cryptosystem based on the practical difficulty of factoring the product of two large prime numbers",
    category: "Security",
  },
  {
    id: 56,
    term: "Zero-Knowledge Proof",
    clue: "Cryptographic method where one party proves to another that a statement is true without revealing extra info",
    category: "Web3 & Crypto",
  },
  {
    id: 57,
    term: "Smart Contract",
    clue: "Self-executing program stored on a blockchain that runs when predetermined conditions are met",
    category: "Web3 & Crypto",
  },
  {
    id: 58,
    term: "Machine Learning",
    clue: "Field of study giving computers the ability to learn without being explicitly programmed",
    category: "AI & Data",
  },
  {
    id: 59,
    term: "Backpropagation",
    clue: "Algorithm widely used in training feedforward artificial neural networks to compute gradient of loss",
    category: "AI & Data",
  },

  // --- Band 7: 60 - 69 (Column 6) ---
  {
    id: 60,
    term: "Gradient Descent",
    clue: "First-order iterative optimization algorithm for finding the local minimum of a differentiable function",
    category: "AI & Data",
  },
  {
    id: 61,
    term: "Transformer",
    clue: 'Deep learning architecture introduced in "Attention Is All You Need" powering modern LLMs',
    category: "AI & Data",
  },
  {
    id: 62,
    term: "Attention Mechanism",
    clue: "Component in neural networks allowing models to dynamically focus on different parts of an input sequence",
    category: "AI & Data",
  },
  {
    id: 63,
    term: "Overfitting",
    clue: "Modeling error where a function is too closely aligned to a limited training dataset and fails on new data",
    category: "AI & Data",
  },
  {
    id: 64,
    term: "64-bit",
    clue: "Processor architecture with 64-bit wide integer registers and memory addressing up to 16 exabytes",
    category: "Computer Systems",
  },
  {
    id: 65,
    term: "NaN",
    clue: 'Numeric data type value representing an undefined or unrepresentable value ("Not a Number")',
    category: "Code Execution",
    codeSnippet: 'console.log(typeof NaN); // "number"',
  },
  {
    id: 66,
    term: "undefined",
    clue: "Primitive value in JavaScript automatically assigned to variables that have just been declared",
    category: "Code Execution",
    codeSnippet: "let val;\nconsole.log(val);",
  },
  {
    id: 67,
    term: "Recursion",
    clue: "Programming technique where a function calls itself directly or indirectly to solve smaller subproblems",
    category: "Programming",
  },
  {
    id: 68,
    term: "Tail Call",
    clue: "Function call performed as the final action of a subroutine, enabling stack space optimization",
    category: "Programming",
  },
  {
    id: 69,
    term: "Memoization",
    clue: "Optimization technique that speeds up programs by storing results of expensive function calls",
    category: "Algorithms",
  },

  // --- Band 8: 70 - 79 (Column 7) ---
  {
    id: 70,
    term: "Dynamic Programming",
    clue: "Algorithmic paradigm solving complex problems by breaking them down into overlapping subproblems",
    category: "Algorithms",
  },
  {
    id: 71,
    term: "Greedy Algorithm",
    clue: "Algorithmic paradigm that makes the locally optimal choice at each stage with hopes of finding global optimum",
    category: "Algorithms",
  },
  {
    id: 72,
    term: "Garbage Collection",
    clue: "Automatic memory management feature that reclaims memory occupied by objects no longer in use",
    category: "Runtimes",
  },
  {
    id: 73,
    term: "V8 Engine",
    clue: "Google's open source high-performance JavaScript and WebAssembly engine written in C++",
    category: "Runtimes",
  },
  {
    id: 74,
    term: "Event Loop",
    clue: "Core architectural loop in Node.js and browsers responsible for coordinating async callbacks",
    category: "Runtimes",
  },
  {
    id: 75,
    term: "Promise.all",
    clue: "JavaScript method that takes an iterable of promises and returns a single promise resolving when all resolve",
    category: "Code Execution",
    codeSnippet: "await Promise.all([p1, p2]);",
  },
  {
    id: 76,
    term: "Microservices",
    clue: "Architectural style that structures an application as a collection of small, loosely coupled services",
    category: "Architecture",
  },
  {
    id: 77,
    term: "Load Balancer",
    clue: "Reverse proxy device or service distributing incoming network traffic across multiple backend servers",
    category: "Architecture",
  },
  {
    id: 78,
    term: "CDN",
    clue: "Geographically distributed network of proxy servers providing high availability and performance (Content Delivery Network)",
    category: "Architecture",
  },
  {
    id: 79,
    term: "Sharding",
    clue: "Database partitioning technique that separates large databases into smaller, faster, more easily managed parts",
    category: "Databases",
  },

  // --- Band 9: 80 - 90 (Column 8) ---
  {
    id: 80,
    term: "Port 80",
    clue: "Default networking port assigned for unencrypted HTTP web server traffic",
    category: "Networking",
  },
  {
    id: 81,
    term: "Port 443",
    clue: "Default networking port assigned for secure, encrypted HTTPS web traffic over TLS/SSL",
    category: "Networking",
  },
  {
    id: 82,
    term: "Port 22",
    clue: "Default network port used by the Secure Shell (SSH) protocol for remote server login",
    category: "Networking",
  },
  {
    id: 83,
    term: "IPv6",
    clue: "Internet Protocol version using 128-bit addresses to overcome IPv4 address exhaustion",
    category: "Networking",
  },
  {
    id: 84,
    term: "Subnet Mask",
    clue: "32-bit number used to divide an IP address into network and host addresses",
    category: "Networking",
  },
  {
    id: 85,
    term: "None",
    clue: "Python singleton object used to signify the absence of a value",
    category: "Code Execution",
    codeSnippet: "def f(): pass\nprint(f()) # None",
  },
  {
    id: 86,
    term: "True",
    clue: "What is the boolean result of (0.1 + 0.2 == 0.3) in Python / JS?",
    category: "Code Execution",
    codeSnippet:
      'print(bool([] == False)) # False\n# But what is bool("0")?\nprint(bool("0")) # True',
  },
  {
    id: 87,
    term: "1024",
    clue: "How many bytes are in a kibibyte (2^10)?",
    category: "Computer Systems",
  },
  {
    id: 88,
    term: "256",
    clue: "Total distinct integer values that can be represented by a single 8-bit unsigned byte (2^8)",
    category: "Computer Systems",
  },
  {
    id: 89,
    term: "Zero Indexing",
    clue: "Array numbering convention where the initial element of a sequence is assigned the index 0",
    category: "Programming",
  },
  {
    id: 90,
    term: "Full House",
    clue: "Ultimate tambola achievement: all fifteen cells marked on your ticket!",
    category: "Tambola Lore",
  },
];
