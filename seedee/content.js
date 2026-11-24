// Case facts for the O.E. SeeDee explorable. Everything here comes from the case study text;
// numbers used only to draw pictures are marked "illustrative" where they appear.
window.SeeDee = (function () {
  'use strict';

  const ICON = {
    lead: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z',
    rd: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9',
    ops: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
    cust: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0 0-6M15.5 14.2a5.5 5.5 0 0 1 6 5.8',
    fin: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    yes: 'M5 12.5l4.5 4.5L19 7.5',
    no: 'M6 6l12 12M18 6L6 18',
    unc: 'M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4M12 18h.01',
    ip: 'M12 3l8 3v6c0 4.5-3.3 7.9-8 9-4.7-1.1-8-4.5-8-9V6z',
    doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
    board: 'M3 12h18M6 12v8M18 12v8M9 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    tap: 'M9 11V5a2 2 0 0 1 4 0v6l4.5 1.2a2 2 0 0 1 1.4 2.3L18 20H9l-4-5.5a1.6 1.6 0 0 1 2.5-2z',
    factory: 'M3 21V10l6 4v-4l6 4V5h5v16zM7 17h2M12 17h2M17 17h.01',
    building: 'M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 12h3M8 16h3',
    truck: 'M2 7h11v9H2zM13 10h4l3 3v3h-7zM6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
    wrench: 'M14.5 6.5a4 4 0 0 0-5 5L3.5 17.5l3 3 6-6a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    flag: 'M6 21V4M6 4h11l-2.5 4 2.5 4H6',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    swap: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4',
    right: 'M5 12h14M13 6l6 6-6 6',
    left: 'M19 12H5M11 6l-6 6 6 6',
    star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z',
    lines: 'M4 7h7M4 12h7M4 17h7M15 5h5v5h-5zM15 14h5v5h-5z',
    refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    flat: 'M4 12h16',
    car: 'M3 13l2-5h14l2 5v5H3zM3 13h18M7 18v2M17 18v2M7 15.5h.01M17 15.5h.01',
    plane: 'M12 2c1 0 1.5 1 1.5 2.5V9l7.5 4.5v2l-7.5-2V18l2.5 2v1.5l-4-1-4 1V20l2.5-2v-4.5l-7.5 2v-2L10.5 9V4.5C10.5 3 11 2 12 2z',
    cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
    digger: 'M3 18h12a2 2 0 0 0 0-4H3a2 2 0 0 0 0 4zM5 14V9h5l2 5M14 12l5-7 2 4-2 2',
    key: 'M21 8.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM15 11L4 21M6.5 18.7l2 2.2M9.5 16l2 2.2',
    dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01'
  };

  const LANES = [
    { key: 'lead', name: 'Leadership' },
    { key: 'rd', name: 'R&D / Engineering' },
    { key: 'ops', name: 'Supply chain / Operations' },
    { key: 'cust', name: 'Customer development' },
    { key: 'fin', name: 'Finance and corporate' }
  ];

  // Names of the two product lines (Product X and Product Y in the original case study).
  const PRODUCTS = { x: 'Xentra', y: 'Yotta' };

  const CASES = [
    { k: 'A', cap: 'All leaders sit in A. B has sales and service staff, plus a few corporate people.' },
    { k: 'B', cap: PRODUCTS.y + ' R&D, Sales and Service move to B. So does half the ' + PRODUCTS.x + ' team.' },
    { k: 'C', cap: 'Procurement and Quality move to B as well.' },
    { k: 'D', cap: 'Almost everyone is in B. The CEO, CLO and A’s board stay in A.' }
  ];

  // loc: which company employs the role in cases A, B, C, D.
  const ROLES = [
    { id: 'ceo', label: 'CEO', lane: 0, lvl: 'exec', loc: 'AAAA', name: 'Chief Executive Officer', does: 'Five direct reports: CLO, CFO, COO, Chief R&D Officer and Chief Customer Development Officer.', note: { 3: 'Sits on Company A’s board, which meets in Country A and approves all key strategic decisions.' } },
    { id: 'clo', label: 'CLO', lane: 0, lvl: 'exec', loc: 'AAAA', name: 'Chief Legal Officer', does: 'IP protection, major contracts, compliance and governance.' },
    { id: 'crdo', label: 'Chief R&D', lane: 1, lvl: 'exec', loc: 'AAAB', name: 'Chief R&D Officer', does: 'Leads R&D and engineering, a key value driver. Two directors report in: ' + PRODUCTS.x + ' and ' + PRODUCTS.y + '.' },
    { id: 'rdx', label: PRODUCTS.x, lane: 1, lvl: 'dir', loc: 'AAAB', name: 'R&D Director, ' + PRODUCTS.x, does: 'Technical development, engineering direction and product support for the ' + PRODUCTS.x + ' line.', note: { 1: 'Stays in A while about half the team moves to B.', 2: 'Stays in A while about half the team sits in B.' } },
    { id: 'rdy', label: PRODUCTS.y, lane: 1, lvl: 'dir', loc: 'ABBB', name: 'R&D Director, ' + PRODUCTS.y, does: 'Technical development, engineering direction and product support for the ' + PRODUCTS.y + ' line.' },
    { id: 'coo', label: 'COO', lane: 2, lvl: 'exec', loc: 'AAAB', name: 'Chief Operating Officer', does: 'Supply chain and operating execution, including the contract manufacturers in Country C.' },
    { id: 'proc', label: 'Procurement', lane: 2, lvl: 'dir', loc: 'AABB', name: 'Procurement Director', does: 'Sourcing from the third-party contract manufacturers.' },
    { id: 'log', label: 'Logistics', lane: 2, lvl: 'dir', loc: 'AAAB', name: 'Logistics Director', does: 'Production planning and logistics.' },
    { id: 'qa', label: 'Quality', lane: 2, lvl: 'dir', loc: 'AABB', name: 'Quality Assurance Director', does: 'Quality oversight of outsourced production.' },
    { id: 'ccdo', label: 'Chief Customer', lane: 3, lvl: 'exec', loc: 'AAAB', name: 'Chief Customer Development Officer', does: 'Customer-facing and commercial functions. Two directors report in: Sales and Service.' },
    { id: 'sales', label: 'Sales', lane: 3, lvl: 'dir', loc: 'ABBB', name: 'Director of Sales Operations', does: 'Sales, customer account coordination and sales support.' },
    { id: 'svc', label: 'Service', lane: 3, lvl: 'dir', loc: 'ABBB', name: 'Director of Service Operations', does: 'After-sales service: installation, maintenance and field service. No separate service fee.' },
    { id: 'cfo', label: 'CFO', lane: 4, lvl: 'exec', loc: 'AAAB', name: 'Chief Financial Officer', does: 'Budgeting, planning and financial oversight.', note: { 3: 'Employed by B, but sits on Company A’s board, which meets in Country A.' } },
    { id: 'acct', label: 'Accounting', lane: 4, lvl: 'dir', loc: 'AAAB', name: 'Accounting Director', does: 'Corporate function under the CFO.' },
    { id: 'it', label: 'IT', lane: 4, lvl: 'dir', loc: 'AAAB', name: 'IT Director', does: 'Corporate function under the CFO.' },
    { id: 'tax', label: 'Tax', lane: 4, lvl: 'dir', loc: 'AAAB', name: 'Tax & Treasury Director', does: 'Corporate function under the CFO.' },
    { id: 'hr', label: 'HR', lane: 4, lvl: 'dir', loc: 'AAAB', name: 'HR Director', does: 'Corporate function under the CFO.' }
  ];

  // n dots per team are illustrative; inB is how many of them sit in Company B in cases A-D.
  const TEAMS = [
    { id: 'tx', label: PRODUCTS.x, lane: 1, n: 6, inB: [0, 3, 3, 6], name: PRODUCTS.x + ' engineers', notes: ['All in A.', 'About half move to B. Their director stays in A.', 'About half in B. Their director stays in A.', 'All in B.'] },
    { id: 'ty', label: PRODUCTS.y, lane: 1, n: 6, inB: [0, 6, 6, 6], name: PRODUCTS.y + ' engineers', notes: ['All in A.', 'All move to B with their director.', 'All in B.', 'All in B.'] },
    { id: 'tp', label: 'Proc', lane: 2, n: 4, inB: [0, 0, 4, 4], name: 'Procurement team', notes: ['All in A.', 'All in A.', 'All move to B with their director.', 'All in B.'] },
    { id: 'tl', label: 'Log', lane: 2, n: 4, inB: [0, 0, 0, 4], name: 'Logistics team', notes: ['All in A.', 'All in A.', 'All in A.', 'All in B.'] },
    { id: 'tq', label: 'QA', lane: 2, n: 4, inB: [0, 0, 4, 4], name: 'Quality team', notes: ['All in A.', 'All in A.', 'All move to B with their director.', 'All in B.'] },
    { id: 'ts', label: 'Sales', lane: 3, n: 6, inB: [4, 6, 6, 6], name: 'Sales staff', notes: ['A number work in B. Their director is in A.', 'All in B, now with their director.', 'All in B.', 'All in B.'] },
    { id: 'tv', label: 'Service', lane: 3, n: 6, inB: [4, 6, 6, 6], name: 'Service staff', notes: ['A number work in B. Their director is in A.', 'All in B, now with their director.', 'All in B.', 'All in B.'] },
    { id: 'tc', label: 'Corp', lane: 4, n: 8, inB: [2, 2, 2, 6], name: 'Corporate staff', notes: ['Most in A. A few in B.', 'Most in A. A few in B.', 'Most in A. A few in B.', 'Most in B. A few accounting and HR people stay in A.'] }
  ];

  const ANCHORS = [
    { id: 'ip', label: 'IP', icon: 'ip', name: 'Legal IP owner', does: 'Company A legally owns the group’s IP in every case.', from: 0 },
    { id: 'doc', label: 'Contract', icon: 'doc', name: 'Intercompany agreement', does: 'Names Company A as primary IP owner and risk bearer. B is left an arm’s-length return and the residual flows to A.', from: 0 },
    { id: 'board', label: 'Board', icon: 'board', name: 'Company A’s board', does: 'Includes the CEO and CFO. Meets regularly in Country A to review and approve all key strategic decisions.', from: 3 }
  ];

  const BUSINESS = {
    rd: { title: 'R&D and engineering', tag: 'Key value driver', lines: ['Product design, testing, validation and application engineering.', 'Customers buy for superior technical solutions.'] },
    quality: { title: 'Product quality', tag: 'Key value driver', lines: ['Performance, durability, precision and repeatability.', 'Customers see the products as the best and most reliable in their category.'] },
    customers: { title: 'Customer relationships', tag: 'Not a primary value driver', lines: ['Important, but customers ultimately buy for the product.'] },
    price: { title: 'Premium price', tag: 'Commercial model', lines: ['Sold at the premium end of the market, on performance, engineering quality and reliability.'] },
    lines: { title: PRODUCTS.x + ' and ' + PRODUCTS.y, tag: 'Two product lines', lines: ['Some shared technology and engineering know-how.', 'Different industry segments and materially different designs, so each needs its own development.', 'Called Product X and Product Y in the original case study.'] },
    service: { title: 'Service is in the price', tag: 'No separate fee', lines: ['Installation, technical support and troubleshooting come with the product.', 'After warranty, customers pay only for parts.'] },
    buyers: { title: 'Business customers', tag: 'B2B machine tools', lines: ['Manufacturers in automotive, aerospace, electronics, heavy equipment and general industry.'] },
    ip: { title: 'Intangibles', tag: 'Company A is legal owner', lines: ['Product technology, engineering know-how, design specifications, testing data, process knowledge, software features, trade names, service know-how and application expertise.', 'Some is shared across the group, some is specific to ' + PRODUCTS.x + ' or ' + PRODUCTS.y + '.'] }
  };

  const FLOW = {
    makers: { title: 'Contract manufacturers', tag: 'Third party · Country C', lines: ['Independent. O.E. SeeDee owns no factories.'] },
    a: { title: 'Company A', tag: 'Group · Country A', lines: ['Contracts with the makers, buys finished goods and resells them.', 'Legal owner of the IP. Named risk bearer in the intercompany agreement.'] },
    b: { title: 'Company B', tag: 'Group · Country B', lines: ['Buys from Company A and sells to customers in its market.'] },
    custB: { title: 'Customers in B’s market', tag: 'Third party', lines: ['The larger market by volume.'] },
    dist: { title: 'Distributor', tag: 'Third party · Country D', lines: ['Unrelated. Buys directly from Company A.'] },
    custD: { title: 'Customers in Country D', tag: 'Third party', lines: ['Much lower volume than B’s market, at higher prices.'] },
    e_buy: { title: 'A buys finished goods', tag: 'Third-party price', lines: ['Company A contracts directly with the makers.'] },
    e_tp: { title: 'A sells to B', tag: 'The transfer price', lines: ['Set to leave Company B an arm’s-length return.', 'All residual profit or loss flows to Company A.'] },
    e_sellB: { title: 'B sells to customers', tag: 'Third-party price', lines: ['Premium pricing, service included.'] },
    e_dist: { title: 'A sells to the distributor', tag: 'Third-party price', lines: ['Higher than the price Company B could bear and stay profitable.'] },
    e_sellD: { title: 'Distributor sells on', tag: 'Third-party price', lines: ['Prices in Country D are higher than in B’s market.'] }
  };

  // Illustrative index numbers for the price puzzle (B's selling price = 100).
  const PRICE = { today: 55, dPrice: 95, bSell: 100, bOpex: 25, dSell: 135 };

  // Illustrative operating margins by year. The case gives the shape, not the figures:
  // A's margin swings with the group and went negative in 2009; B's stays flat.
  const RISK = {
    years: [2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014],
    a: [10, 13, 16, 17, 8, -11, 2, 11, 14, 16, 13],
    b: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
  };

  // The hidden path: Case D's history, told as a trail. It opens once all four cases are answered.
  // who: the company the actor sits in.
  const HISTORY = {
    intro: { title: 'Case D, again', lines: [
      'Almost all the people are in Company B. Company A has the CEO, the CLO and some support staff.',
      'Most practitioners say No here, and Country B’s tax authority can be expected to push back.',
      'But this group has a history.'] },
    beats: [
      { label: 'Heyday', icon: 'star', when: 'Long before', title: 'SeeDee, on its own', lines: [
        { who: 'B', t: 'Company B used to be an independent company called SeeDee.' },
        { t: 'It was successful for many years.' }] },
      { label: 'Decline', icon: 'down', when: 'Then', title: 'Hard times', lines: [
        { t: 'Manufacturing was no longer cost competitive. Quality and service slipped.' },
        { t: 'Losses, a shrinking market share and grim expectations.' },
        { t: 'Still some valuable IP and good engineers, but too little money for R&D.' }] },
      { label: 'The bid', icon: 'cust', when: 'The deal', title: 'Olivia and Emily', lines: [
        { who: 'A', t: 'Olivia, an experienced industry leader, and Emily, a savvy legal adviser, set up Company A with outside investors and lenders.' },
        { who: 'A', t: 'Olivia becomes CEO. Emily becomes CLO.' },
        { t: 'Company A buys SeeDee for 100. The group is renamed O.E. SeeDee.' }] },
      { label: 'Reset', icon: 'swap', when: 'Soon after', title: 'The IP moves. The leaders change.', lines: [
        { t: 'All non-routine IP is transferred from B to A.' },
        { t: 'It is valued with the acquisition price method. Assume nobody questions the price.' },
        { who: 'A', t: 'From now on, Company A funds all IP development that B carries out.' },
        { who: 'A', t: 'Olivia and Emily replace much of B’s old leadership.' },
        { who: 'B', t: 'The new hires get a mandate: lower costs, better quality, better service, more innovation.' }] },
      { label: 'The fix', icon: 'wrench', when: 'Turnaround', title: 'Who did what', lines: [
        { who: 'A', t: 'Olivia and Emily use their industry contacts to find a far cheaper contract manufacturer.' },
        { who: 'B', t: 'The new supply chain chief carries out their strategy.' },
        { who: 'A', t: 'Emily helps negotiate the sourcing agreement and the new intercompany supply policy.' },
        { who: 'B', t: 'The new quality director, directed by Olivia, builds a better quality program with the supplier.' },
        { who: 'A', t: 'Olivia visits customers to explain the changes.' }] },
      { label: 'Lean years', icon: 'fin', when: 'Years 1 to 3', title: 'Company A pays the bill', chart: [0, 2], lines: [
        { who: 'A', t: 'Company A funds B’s losses and below-routine profits for three years.' }] },
      { label: 'Year 5', icon: 'flag', when: 'Year 5', title: 'Thriving', chart: [3, 4], lines: [
        { t: 'Residual profits since year 4, and expected to continue.' },
        { t: 'The people sit exactly as in Case D.' },
        { t: 'The pricing is unchanged: all residual profit goes to Company A.' }] }
    ],
    // Illustrative results by year under the pricing policy: B keeps a routine return, A takes the rest.
    chart: { a: [-30, -18, -5, 14, 26], b: 12 }
  };

  // Ingredients for a made-up sign-in name.
  const ALIAS = {
    first: ['Arm’s-Length', 'Residual', 'Routine', 'Tested', 'Comparable', 'Interquartile', 'Benchmark', 'Intangible', 'Limited-Risk', 'Marginal'],
    second: ['Marmot', 'Ibex', 'Alpinist', 'Yodeler', 'Edelweiss', 'Chamois', 'Glacier', 'Eagle', 'Mountaineer', 'Avalanche']
  };

  return { ICON, LANES, PRODUCTS, CASES, HISTORY, ALIAS, ROLES, TEAMS, ANCHORS, BUSINESS, FLOW, PRICE, RISK };
})();
