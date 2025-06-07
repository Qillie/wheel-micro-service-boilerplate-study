import { ModelABC } from "@qillie/wheel-micro-service";
import { Table, Column, AllowNull, DataType, Unique } from "sequelize-typescript";

@Table({
    freezeTableName: true,
    tableName: "user_resume_prompt",
})
export default class UserResumePromptTable extends ModelABC {
    @AllowNull(false)
    @Unique
    @Column({ type: DataType.STRING, comment: "사용자 ID" })
    user_id!: string;

    @AllowNull(true)
    @Column({ type: DataType.TEXT, comment: "이력서" })
    resume!: string;

    @AllowNull(true)
    @Column({ type: DataType.TEXT, comment: "프롬프트" })
    prompt!: string;

    @AllowNull(false)
    @Column({ type: DataType.DATE, defaultValue: DataType.NOW, comment: "수정일" })
    updated_at!: Date;
} 