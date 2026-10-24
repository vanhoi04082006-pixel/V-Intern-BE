import type { CreateTemplateDto, TemplateTaskDto } from './template.dto';
import { MINI_PROJECT_DOMAINS, MiniProjectDomain } from './mini-project-domains';

function instructions(domain: MiniProjectDomain): string {
  return `# ${domain.name}\n\n${domain.description}\n\n## Chuẩn bị\nNode.js 22 trở lên. Không cần npm install, database, tài khoản cloud hay secret. Mở terminal ngay thư mục chứa package.json.\n\n## Chạy và hiểu kết quả\n- node demo.cjs: xem dữ liệu giả và các hàm phải hoàn thành; lệnh này chưa chạy nghiệp vụ.\n- node demo.cjs --run: chạy một tình huống; ban đầu báo TODO và exit 2 là có chủ đích.\n- node --test test/acceptance.test.cjs: kiểm tiêu chí công khai; ban đầu đỏ vì src/model.cjs chưa hoàn thành.\n- Sau khi làm bài, hai lệnh cuối phải exit 0. Test xanh chưa đồng nghĩa đã được giảng viên chấm đạt.\n\n## Hợp đồng hàm\n${domain.signatures.map(value => '- ' + value).join('\n')}\nMảng đầu vào chứa các bản ghi hợp lệ được tạo theo hợp đồng. Cần kiểm dữ liệu mới đi vào hàm; không đổi thứ tự hoặc ghi vào object gốc.\n\n## Quy tắc\n${domain.rules.map((value, index) => `${index + 1}. ${value}`).join('\n')}\n\n## Demo bàn giao\n${domain.scenarios.map(value => '- ' + value).join('\n')}\n\n## Ngoài phạm vi\n${domain.exclusions.join('; ')}. Không mở rộng thành ứng dụng production. Có thể thêm giao diện sau khi core đã đạt, nhưng không thay hợp đồng hàm.\n\n## Nộp bài\nGiữ chữ ký export, thêm kiểm thử biên, ghi lệnh/kết quả và giới hạn trong README. Commit code vào repository được giao, gửi link PR và SHA theo luồng nộp bài của V-Intern. Không đưa credential hoặc thông tin sinh viên thật vào bài.\n\nStarter là đề để hoàn thành. P03 sẽ kiểm lời giải, biến thể lỗi và runner riêng; gói này không chứa hidden test/lời giải hay suite binding đã tin cậy.\n`;
}
function packageFor(domain: MiniProjectDomain) {
  const readme = instructions(domain);
  return {
    schemaVersion: 1 as const,
    prerequisites: ['JavaScript: array/object, hàm, throw Error và CommonJS', 'Node.js 22+ và terminal; đọc node:test/assert', 'Git cơ bản để commit và tạo PR'],
    setup: 'Tạo thư mục bài riêng; giữ nguyên đường dẫn file trong gói. Dùng Node.js 22+. Không cần cài dependency, DB hoặc tải công cụ. Chỉ dùng dữ liệu .test/giả đi kèm.',
    run: 'Chạy node demo.cjs để đọc dữ liệu; node demo.cjs --run và node --test test/acceptance.test.cjs để nghiệm thu. Starter ban đầu báo TODO/đỏ; hoàn thành src/model.cjs để hai lệnh cuối exit 0. Xem README cho hợp đồng và demo.',
    starterFiles: [
      { path: 'README.md', content: readme },
      { path: 'package.json', content: JSON.stringify({ name: `vintern-mini-${domain.slug}`, version: '1.0.0', private: true, description: domain.description, engines: { node: '>=22' }, scripts: { demo: 'node demo.cjs', test: 'node --test test/acceptance.test.cjs' } }, null, 2) + '\n' },
      { path: 'src/model.cjs', content: `'use strict';\n// Đọc README trước khi viết. Không đổi tên hàm; không sửa input.\n${domain.functions.map(name => `function ${name}() { throw new Error('TODO: ${name}'); }`).join('\n')}\nmodule.exports = { ${domain.functions.join(', ')} };\n` },
      { path: 'demo.cjs', content: `'use strict';\nconst sample = require('./data/sample.json');\nconst model = require('./src/model.cjs');\nconsole.log(${JSON.stringify(domain.name + ' — dữ liệu mẫu; chưa phải kết quả nghiệm thu')});\nconsole.log(JSON.stringify(sample, null, 2));\nif (process.argv.includes('--run')) {\n  try { console.log('Kết quả:', JSON.stringify(${domain.demo}, null, 2)); }\n  catch (error) { console.error(error.message); process.exitCode = 2; }\n} else console.log('API cần làm: ${domain.functions.join(', ')}. Xem README; chạy --run sau khi hoàn thành.');\n` },
      { path: 'test/acceptance.test.cjs', content: `'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst model = require('../src/model.cjs');\n// Public acceptance tests: starter ban đầu đỏ vì TODO; không phải hidden suite.\n${domain.tests}\n` },
    ],
    sampleData: [{ path: 'data/sample.json', content: JSON.stringify(domain.sample, null, 2) + '\n' }],
  };
}
function miniProject(domain: MiniProjectDomain): CreateTemplateDto {
  const task = (key: string, title: string, requirements: string, dependsOn: string[], order: number, hours: number): TemplateTaskDto => ({
    key, title, requirements, role: 'backend', storyPoints: order === 2 ? 3 : 2,
    dependsOn, recommendedOrder: order, estimatedHours: hours, complexity: 'easy', priority: order < 3 ? 'high' : 'medium', skillTags: ['JavaScript', 'validation', 'testing', 'Git'],
    expectedOutput: `${title}: commit/PR có code hoặc tài liệu, lệnh kiểm và bằng chứng của từng tiêu chí.`,
    dod: order === 1 ? ['Chạy demo dữ liệu mẫu thành công; giải thích TODO ban đầu.', 'Đọc và ghi lại hợp đồng hàm, phạm vi và dữ liệu biên.']
      : order === 2 ? ['Hoàn thành các export đúng chữ ký README; không mutate input.', 'Các public acceptance test đạt với dữ liệu hợp lệ và dữ liệu sai.']
        : order === 3 ? ['Bổ sung test biên theo business rules, không xóa/nới test được giao.', 'Chạy lại demo --run và test, ghi exit code và giới hạn.']
          : ['README ghi cách chạy từ thư mục sạch và kịch bản demo.', 'PR có SHA; giải thích được lựa chọn và chờ giảng viên xác nhận.'],
  });
  const tasks = [
    task('read-contract', 'Đọc đề và chạy starter', 'Chuẩn bị Node 22+, chạy demo dữ liệu, đọc hợp đồng hàm và phân loại trường hợp đúng/sai. Ghi kết quả ban đầu và không gọi starter TODO là lỗi hệ thống.', [], 1, 2),
    task('implement-core', 'Hoàn thành module nghiệp vụ', domain.rules.join('\n'), ['read-contract'], 2, domain.days >= 4 ? 6 : 4),
    task('verify-boundaries', 'Kiểm dữ liệu biên và tính bất biến', `Chạy public tests, bổ sung ca biên và kiểm input trước/sau. Demo: ${domain.scenarios.join(' ')}`, ['implement-core'], 3, 3),
    task('handover', 'Demo và bàn giao bằng PR', 'Hoàn thiện README, chạy từ thư mục sạch, nộp PR/SHA và mô tả bằng chứng. Không nói hidden test đã chạy khi chưa có receipt của runner.', ['verify-boundaries'], 4, 2),
  ];
  return {
    code: `MINI-${domain.slug.toUpperCase()}-V1`, slug: `mini-${domain.slug}`, name: domain.name, description: domain.description,
    category: 'mini-projects', difficulty: 'beginner', techStack: ['JavaScript', 'Node.js 22', 'node:test'], roles: ['backend'], recommendedTeamSize: 1,
    estimatedDurationDays: domain.days, modules: domain.functions, roleDetails: [{ code: 'backend', title: 'Backend Developer — nền tảng JavaScript', countMin: 1, countMax: 1, level: 'junior', requiredSkills: ['JavaScript', 'Git'], recommendedSkills: ['node:test'], responsibilities: ['Xây domain module có validation.', 'Kiểm thử, demo và nộp PR có bằng chứng.'] }],
    objectives: { business: domain.description, learning: ['Đọc hợp đồng trước khi code', 'Kiểm dữ liệu tại boundary và giữ input bất biến', 'Chứng minh hành vi bằng kiểm thử'], product: ['Module chạy local không dependency', 'README và PR giải thích được'] },
    scopeIn: domain.signatures, scopeOut: ['Đăng nhập và phân quyền', 'Thanh toán hoặc email thật', ...domain.exclusions],
    functionalRequirements: domain.rules, businessRules: domain.rules,
    nonFunctionalRequirements: ['Không gọi mạng, dùng dữ liệu cá nhân thật hoặc cài dependency.', 'Mọi input invalid ném Error; không âm thầm trả kết quả thành công.', 'Không ghi vào mảng/object input; test phải kiểm tra điều này.'],
    architecture: { overview: 'Bài tập domain module CommonJS chạy bằng Node 22; demo đọc JSON giả, gọi hàm thuần rồi in kết quả. Chưa có HTTP server, UI, database hay authentication.', entities: domain.entities, apiSuggestions: domain.signatures, frontendPages: ['Không có trang web trong phạm vi; terminal chạy demo.cjs. Giao diện là hướng mở rộng riêng.'] },
    sprints: [{ name: 'Từ hợp đồng đến demo', goal: 'Hoàn thành module nhỏ, kiểm dữ liệu biên và bàn giao bằng bằng chứng.', durationDays: domain.days, tasks }],
    milestones: [{ title: 'Demo hoàn chỉnh', day: domain.days, taskKeys: tasks.map(task => task.key!), acceptance: 'Demo --run và public test exit 0; README và PR giải thích được. Giảng viên xác nhận kết quả cuối.' }],
    expectedOutcome: `${domain.name} chạy bằng Node local; người học giải thích được validation, dữ liệu biên và bằng chứng test.`,
    expectedOutputs: { deliverables: ['src/model.cjs hoàn chỉnh', 'Kiểm thử công khai và bổ sung', 'README theo máy sạch'], artifacts: ['Link PR và SHA', 'Lệnh/exit code và giới hạn đã biết'] },
    acceptance: { definitionOfDone: ['Đúng mọi business rule được giao', 'Input hợp lệ/sai đều có test', 'Giảng viên xem PR và xác nhận'], qualityGates: ['node demo.cjs --run exit 0', 'node --test test/acceptance.test.cjs exit 0', 'Không xóa test, secret hoặc dữ liệu thật'] },
    dod: ['Đúng hợp đồng và không mutate input', 'Demo/test có bằng chứng; README chạy lại được', 'PR được giảng viên xác nhận'], rubricVersion: 'task-review-v1', scenarios: domain.scenarios,
    documentation: instructions(domain), learningPackage: packageFor(domain),
  };
}
/** Separate codes preserve every legacy 14-day template and its pinned runs. Opt-in seed only. */
export const MINI_PROJECT_LIBRARY: CreateTemplateDto[] = MINI_PROJECT_DOMAINS.map(miniProject);
